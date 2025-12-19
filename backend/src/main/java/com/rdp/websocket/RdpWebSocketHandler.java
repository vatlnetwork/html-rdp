package com.rdp.websocket;

import com.rdp.rdp.GuacamoleConnectionManager;
import org.apache.guacamole.GuacamoleException;
import org.apache.guacamole.io.GuacamoleReader;
import org.apache.guacamole.io.GuacamoleWriter;
import org.apache.guacamole.net.GuacamoleTunnel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RdpWebSocketHandler extends TextWebSocketHandler {

    private static final Logger logger = LoggerFactory.getLogger(RdpWebSocketHandler.class);

    private final GuacamoleConnectionManager connectionManager;
    private final Map<String, GuacamoleTunnel> tunnels = new ConcurrentHashMap<>();
    private final Map<String, Thread> readerThreads = new ConcurrentHashMap<>();

    public RdpWebSocketHandler(GuacamoleConnectionManager connectionManager) {
        this.connectionManager = connectionManager;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        logger.info("WebSocket connection established: {}", session.getId());

        try {
            // Parse connection parameters from query string
            URI uri = session.getUri();
            if (uri == null) {
                throw new IllegalArgumentException("No URI available");
            }

            Map<String, String> params = parseQueryString(uri.getQuery());

            String hostname = params.get("hostname");
            String port = params.getOrDefault("port", "3389");
            String username = params.get("username");
            String password = params.get("password");

            logger.debug("Params - hostname: '{}', port: '{}', username: '{}', password length: {}",
                    hostname, port, username, password != null ? password.length() : 0);

            if (hostname == null || hostname.isEmpty()) {
                session.sendMessage(new TextMessage("5.error,14.Invalid hostname,3.400;"));
                session.close(CloseStatus.BAD_DATA);
                return;
            }

            // Create tunnel to guacd
            GuacamoleTunnel tunnel = connectionManager.createTunnel(hostname, port, username, password);
            tunnels.put(session.getId(), tunnel);

            // Send tunnel UUID to client using internal data instruction (empty opcode)
            // This is the format expected by Guacamole.WebSocketTunnel
            String uuid = tunnel.getUUID().toString();
            // Format: 0.,<uuid_length>.<uuid>;
            // The "0." represents an empty string opcode (length 0, followed by dot)
            String uuidInstruction = String.format("0.,%d.%s;", uuid.length(), uuid);
            session.sendMessage(new TextMessage(uuidInstruction));
            logger.debug("Sent UUID instruction: {}", uuidInstruction);

            // Start reader thread to forward guacd responses to WebSocket
            Thread readerThread = new Thread(() -> readFromGuacamole(session, tunnel),
                    "guac-reader-" + session.getId());
            readerThread.setDaemon(true);
            readerThreads.put(session.getId(), readerThread);
            readerThread.start();

            logger.info("RDP tunnel established for session: {}", session.getId());

        } catch (Exception e) {
            logger.error("Failed to establish RDP connection: {}", e.getMessage(), e);
            try {
                String msg = e.getMessage() != null ? e.getMessage() : "Connection failed";
                String errorMsg = String.format("5.error,%d.%s,3.500;", msg.length(), msg);
                session.sendMessage(new TextMessage(errorMsg));
            } catch (Exception ignored) {
            }
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        GuacamoleTunnel tunnel = tunnels.get(session.getId());
        if (tunnel == null) {
            logger.warn("No tunnel found for session: {}", session.getId());
            return;
        }

        String payload = message.getPayload();

        // Check for internal tunnel instructions (empty opcode: "0.,...")
        // These should NOT be forwarded to guacd
        if (payload.startsWith("0.,")) {
            // Handle ping - respond with pong
            if (payload.startsWith("0.,4.ping,")) {
                // Extract timestamp and send pong response
                // Format: 0.,4.ping,<len>.<timestamp>;
                int startIdx = "0.,4.ping,".length();
                int dotIdx = payload.indexOf('.', startIdx);
                if (dotIdx > startIdx) {
                    int semiIdx = payload.indexOf(';', dotIdx);
                    if (semiIdx > dotIdx) {
                        String timestamp = payload.substring(dotIdx + 1, semiIdx);
                        String pongResponse = String.format("0.,4.pong,%d.%s;", timestamp.length(), timestamp);
                        synchronized (session) {
                            if (session.isOpen()) {
                                session.sendMessage(new TextMessage(pongResponse));
                            }
                        }
                        logger.trace("Responded to ping with pong: {}", timestamp);
                    }
                }
            }
            // Don't forward internal instructions to guacd
            return;
        }

        try {
            GuacamoleWriter writer = tunnel.acquireWriter();
            try {
                writer.write(payload.toCharArray());
            } finally {
                tunnel.releaseWriter();
            }
        } catch (GuacamoleException e) {
            logger.error("Failed to write to guacd: {}", e.getMessage());
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        logger.info("WebSocket connection closed: {} with status: {}", session.getId(), status);
        cleanup(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        logger.error("WebSocket transport error for session: {}", session.getId(), exception);
        cleanup(session.getId());
    }

    private void readFromGuacamole(WebSocketSession session, GuacamoleTunnel tunnel) {
        try {
            GuacamoleReader reader = tunnel.acquireReader();
            char[] buffer;

            while ((buffer = reader.read()) != null) {
                if (!session.isOpen()) {
                    break;
                }

                String data = new String(buffer);

                synchronized (session) {
                    if (session.isOpen()) {
                        session.sendMessage(new TextMessage(data));
                    }
                }
            }

            logger.debug("Guacd reader finished for session: {}", session.getId());

        } catch (GuacamoleException | IOException e) {
            if (session.isOpen()) {
                logger.error("Error reading from guacd: {} - {}", e.getClass().getSimpleName(), e.getMessage());
            }
        } finally {
            tunnel.releaseReader();
            try {
                if (session.isOpen()) {
                    session.close(CloseStatus.NORMAL);
                }
            } catch (IOException e) {
                logger.debug("Error closing session", e);
            }
        }
    }

    private void cleanup(String sessionId) {
        // Stop reader thread
        Thread readerThread = readerThreads.remove(sessionId);
        if (readerThread != null) {
            readerThread.interrupt();
        }

        // Close tunnel
        GuacamoleTunnel tunnel = tunnels.remove(sessionId);
        if (tunnel != null) {
            try {
                tunnel.close();
            } catch (GuacamoleException e) {
                logger.debug("Error closing tunnel", e);
            }
        }
    }

    private Map<String, String> parseQueryString(String query) {
        Map<String, String> params = new HashMap<>();
        if (query == null || query.isEmpty()) {
            return params;
        }

        for (String param : query.split("&")) {
            String[] keyValue = param.split("=", 2);
            if (keyValue.length == 2) {
                String key = URLDecoder.decode(keyValue[0], StandardCharsets.UTF_8);
                String value = URLDecoder.decode(keyValue[1], StandardCharsets.UTF_8);
                params.put(key, value);
            } else if (keyValue.length == 1 && !keyValue[0].isEmpty()) {
                String key = URLDecoder.decode(keyValue[0], StandardCharsets.UTF_8);
                params.put(key, "");
            }
        }

        return params;
    }
}

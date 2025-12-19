package com.rdp.rdp;

import org.apache.guacamole.GuacamoleException;
import org.apache.guacamole.net.GuacamoleTunnel;
import org.apache.guacamole.net.InetGuacamoleSocket;
import org.apache.guacamole.net.SimpleGuacamoleTunnel;
import org.apache.guacamole.protocol.ConfiguredGuacamoleSocket;
import org.apache.guacamole.protocol.GuacamoleConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class GuacamoleConnectionManager {

    private static final Logger logger = LoggerFactory.getLogger(GuacamoleConnectionManager.class);

    @Value("${guacd.hostname:localhost}")
    private String guacdHostname;

    @Value("${guacd.port:4822}")
    private int guacdPort;

    public GuacamoleTunnel createTunnel(String hostname, String port, String username, String password)
            throws GuacamoleException {

        // Sanitize port
        String sanitizedPort = port != null ? port.replaceAll("[^0-9]", "") : "3389";
        if (sanitizedPort.isEmpty()) {
            sanitizedPort = "3389";
        }

        logger.info("Creating RDP tunnel to {}:{} (username: {}, password length: {})",
                hostname, sanitizedPort,
                username != null ? username : "<none>",
                password != null ? password.length() : 0);

        // Create Guacamole configuration for RDP
        GuacamoleConfiguration config = new GuacamoleConfiguration();
        config.setProtocol("rdp");

        // Required RDP parameters
        config.setParameter("hostname", hostname);
        config.setParameter("port", sanitizedPort);

        // Optional authentication
        if (username != null && !username.isEmpty()) {
            config.setParameter("username", username);
        }
        if (password != null && !password.isEmpty()) {
            config.setParameter("password", password);
        }

        // Security settings - GNOME Remote Desktop requires NLA/Hybrid
        config.setParameter("security", "nla");
        config.setParameter("ignore-cert", "true");

        // Enable audio support
        config.setParameter("enable-audio", "true");
        config.setParameter("enable-audio-input", "false");

        // Display settings
        config.setParameter("width", "1280");
        config.setParameter("height", "720");
        config.setParameter("dpi", "96");
        config.setParameter("color-depth", "24");
        config.setParameter("resize-method", "display-update");

        // Performance flags
        config.setParameter("disable-wallpaper", "false");
        config.setParameter("disable-theming", "false");
        config.setParameter("disable-font-smoothing", "false");
        config.setParameter("disable-full-window-drag", "true");
        config.setParameter("disable-menu-animations", "true");

        // Keyboard settings
        config.setParameter("server-layout", "en-us-qwerty");

        try {
            logger.debug("Connecting to guacd at {}:{}", guacdHostname, guacdPort);
            InetGuacamoleSocket socket = new InetGuacamoleSocket(guacdHostname, guacdPort);

            logger.debug("Configuring RDP connection...");
            ConfiguredGuacamoleSocket configuredSocket = new ConfiguredGuacamoleSocket(socket, config);

            GuacamoleTunnel tunnel = new SimpleGuacamoleTunnel(configuredSocket);

            logger.info("RDP tunnel created successfully, tunnel UUID: {}", tunnel.getUUID());

            return tunnel;

        } catch (GuacamoleException e) {
            logger.error("Failed to create RDP tunnel: {} - {}", e.getClass().getSimpleName(), e.getMessage());
            throw e;
        }
    }
}

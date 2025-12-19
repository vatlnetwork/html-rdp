package com.rdp.config;

import com.rdp.websocket.RdpWebSocketHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

import java.util.List;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

  private final RdpWebSocketHandler rdpWebSocketHandler;

  public WebSocketConfig(RdpWebSocketHandler rdpWebSocketHandler) {
    this.rdpWebSocketHandler = rdpWebSocketHandler;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    // Custom handshake handler that supports the "guacamole" subprotocol
    DefaultHandshakeHandler handshakeHandler = new DefaultHandshakeHandler() {
      @Override
      protected String selectProtocol(List<String> requestedProtocols, WebSocketHandler webSocketHandler) {
        // Accept "guacamole" subprotocol if requested
        if (requestedProtocols != null && requestedProtocols.contains("guacamole")) {
          return "guacamole";
        }
        return super.selectProtocol(requestedProtocols, webSocketHandler);
      }
    };

    registry.addHandler(rdpWebSocketHandler, "/rdp")
        .setAllowedOrigins("*")
        .setHandshakeHandler(handshakeHandler);
  }

  @Bean
  public ServletServerContainerFactoryBean createWebSocketContainer() {
    ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
    container.setMaxTextMessageBufferSize(65536);
    container.setMaxBinaryMessageBufferSize(65536);
    container.setMaxSessionIdleTimeout(600000L); // 10 minutes
    return container;
  }
}

# Web RDP Client

A web-based Remote Desktop Protocol (RDP) client built with Apache Guacamole. Connect to Windows machines directly from your browser with full keyboard and mouse control, plus audio streaming support.

## Architecture

```
┌──────────────────┐     ┌────────────────────┐     ┌─────────────┐     ┌────────────┐
│                  │     │                    │     │             │     │            │
│  Browser         │────▶│  Spring Boot       │────▶│   guacd     │────▶│  RDP       │
│  (HTML/JS)       │ WS  │  (WebSocket)       │ TCP │  (Daemon)   │ RDP │  Server    │
│                  │     │                    │     │             │     │            │
└──────────────────┘     └────────────────────┘     └─────────────┘     └────────────┘
        :8080                   :8080                    :4822              :3389
```

## Features

- **Web-based RDP client** - No software installation required
- **Full keyboard & mouse control** - Complete remote desktop interaction
- **Audio streaming** - Hear audio from the remote desktop
- **Responsive design** - Works on desktop and mobile browsers
- **Secure connections** - Supports NLA and other RDP security modes
- **Easy deployment** - Docker-based guacd, simple Spring Boot backend

## Prerequisites

- **Java 17+** - For running the Spring Boot backend
- **Maven 3.6+** - For building the backend
- **Docker** - For running the guacd daemon

## Quick Start

### 1. Start guacd (Guacamole Daemon)

```bash
docker-compose up -d
```

This starts the guacd container which handles the actual RDP protocol communication.

### 2. Build and Run the Backend

```bash
cd backend
mvn spring-boot:run
```

The backend will start on port 8080.

### 3. Open the Frontend

Open `frontend/index.html` in your web browser, or serve it via a web server:

```bash
# Using Python's built-in server
cd frontend
python3 -m http.server 3000
```

Then navigate to `http://localhost:3000`

### 4. Connect to an RDP Server

1. Enter the hostname/IP of the Windows machine
2. Enter the port (default: 3389)
3. Optionally enter username and password
4. Click **Connect**

## Configuration

### Backend Configuration

Edit `backend/src/main/resources/application.properties`:

```properties
# Server port
server.port=8080

# Guacd connection settings
guacd.hostname=localhost
guacd.port=4822
```

### Guacd Configuration

The guacd container can be configured via environment variables in `docker-compose.yml`:

```yaml
environment:
  - GUACD_LOG_LEVEL=info  # Options: debug, info, warning, error
```

## Project Structure

```
html-rdp/
├── backend/                          # Java Spring Boot backend
│   ├── pom.xml                       # Maven dependencies
│   └── src/main/java/com/rdp/
│       ├── Application.java          # Spring Boot entry point
│       ├── config/
│       │   └── WebSocketConfig.java  # WebSocket endpoint config
│       ├── websocket/
│       │   └── RdpWebSocketHandler.java  # WebSocket handler
│       └── rdp/
│           └── GuacamoleConnectionManager.java  # RDP connection factory
├── frontend/                         # Web frontend
│   ├── index.html                    # Main HTML page
│   ├── style.css                     # Styling
│   └── app.js                        # Guacamole client logic
├── docker-compose.yml                # guacd container definition
└── README.md                         # This file
```

## How It Works

1. **User enters connection details** in the web form
2. **Browser establishes WebSocket** connection to the Java backend
3. **Backend connects to guacd** using the Guacamole protocol
4. **guacd establishes RDP connection** to the target Windows machine
5. **Display data streams back** through the chain to the browser
6. **User input (keyboard/mouse)** is sent back to the RDP server

## Troubleshooting

### Connection fails immediately

- Ensure guacd is running: `docker ps | grep guacd`
- Check guacd logs: `docker logs guacd`
- Verify the RDP server is accessible from the machine running guacd

### "Invalid hostname" error

- Make sure you've entered a valid hostname or IP address
- The hostname must be reachable from the guacd container

### Authentication errors

- Check that username and password are correct
- For domain accounts, try `DOMAIN\username` or `username@domain`
- Ensure the RDP server allows the security mode being used

### Black screen after connecting

- The remote desktop might be locked - try sending Ctrl+Alt+Del
- Check if the RDP session is already in use
- Verify display settings on the RDP server

### No audio

- Audio streaming requires the RDP server to support audio redirection
- Check Windows Remote Desktop settings on the target machine
- Some Windows editions (like Home) have limited RDP audio support

## Security Considerations

- **Never expose this directly to the internet** without proper authentication
- The current implementation trusts all server certificates (`ignore-cert=true`)
- Consider adding:
  - User authentication layer
  - HTTPS/WSS for encrypted connections
  - Rate limiting
  - Connection logging

## Development

### Running in Development Mode

Backend with hot reload:
```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Dspring.devtools.restart.enabled=true"
```

### Building for Production

```bash
cd backend
mvn clean package -DskipTests
java -jar target/html-rdp-backend-1.0.0.jar
```

## License

This project uses Apache Guacamole libraries which are licensed under the Apache License 2.0.

## Acknowledgments

- [Apache Guacamole](https://guacamole.apache.org/) - The clientless remote desktop gateway
- [guacamole-common-js](https://github.com/apache/guacamole-client) - JavaScript library for Guacamole protocol


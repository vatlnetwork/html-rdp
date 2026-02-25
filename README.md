# Web RDP Client

A web-based Remote Desktop Protocol (RDP) client built with Apache Guacamole. Connect to Windows machines directly from your browser with full keyboard and mouse control, plus audio streaming support.

## Architecture

The frontend connects to a **gateway** (the Spring Boot backend), which can run locally or on a remote server. The gateway connects to guacd, which handles the RDP protocol.

```
┌──────────────────┐     ┌────────────────────┐     ┌─────────────┐     ┌────────────┐
│                  │     │                    │     │             │     │            │
│  Browser         │────▶│  Spring Boot       │────▶│   guacd     │────▶│  RDP       │
│  (HTML/JS)       │ WS  │  (Gateway)         │ TCP │  (Daemon)   │ RDP │  Server    │
│                  │     │  /rdp endpoint     │     │             │     │            │
└──────────────────┘     └────────────────────┘     └─────────────┘     └────────────┘
   (any port)                   :9460*                  :4822              :3389
```

\* Default backend port is 9460 (configurable in `application.properties`).

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

### Option A: Full Ubuntu Setup

For a fresh Ubuntu system, `ubuntu-install.sh` installs Docker, guacd, OpenJDK 21, Maven, and starts the backend:

```bash
./ubuntu-install.sh
```

### Option B: Manual Setup

#### 1. Start guacd (Guacamole Daemon)

```bash
docker compose up -d
```

(Or `docker-compose up -d` if using the older Compose V1.)

This starts the guacd container which handles the actual RDP protocol communication.

#### 2. Build and Run the Backend

```bash
cd backend
mvn spring-boot:run
```

The backend will start on port 9460 (configurable in `application.properties`).

Alternatively, use the provided script:

```bash
cd backend
./start.sh
```

#### 3. Open the Frontend

Open `frontend/index.html` in your web browser, or serve it via a web server:

```bash
# Using Python's built-in server
cd frontend
python3 -m http.server 3000
```

Then navigate to `http://localhost:3000`

#### 4. Connect to an RDP Server

The connection form has two parts:

1. **Gateway** – The hostname and port of the Spring Boot backend (the WebSocket server)
   - For local development: `localhost` and `9460`
   - For remote deployment: your backend server's hostname and port
2. **Server** – The RDP hostname/IP and port (default 3389) of the Windows machine
3. **Authentication** (optional) – Username and password for the RDP session

Click **Connect** to establish the session.

## Configuration

### Backend Configuration

Edit `backend/src/main/resources/application.properties`:

```properties
# Server port (default: 9460)
server.port=9460

# Guacd connection settings (guacd must be reachable from the backend)
guacd.hostname=localhost
guacd.port=4822
```

### Guacd Configuration

The guacd container can be configured via environment variables in `docker-compose.yml`:

```yaml
environment:
  - GUACD_LOG_LEVEL=debug  # Options: debug, info, warning, error
```

## Project Structure

```
html-rdp/
├── backend/                          # Java Spring Boot backend
│   ├── pom.xml                       # Maven dependencies
│   ├── start.sh                      # Build and run script
│   └── src/main/java/com/rdp/
│       ├── Application.java          # Spring Boot entry point
│       ├── config/
│       │   └── WebSocketConfig.java  # WebSocket /rdp endpoint config
│       ├── websocket/
│       │   └── RdpWebSocketHandler.java  # WebSocket handler
│       └── rdp/
│           └── GuacamoleConnectionManager.java  # RDP connection factory
├── frontend/                         # Web frontend
│   ├── index.html                    # Main HTML page
│   ├── style.css                     # Styling
│   ├── app.js                        # Guacamole client logic
│   └── guacamole.js                  # Apache Guacamole JS library (guacamole-common-js)
├── docker-compose.yml                # guacd container definition
├── ubuntu-install.sh                 # Full Ubuntu setup script (Docker, JDK, Maven, guacd, backend)
└── README.md                         # This file
```

## How It Works

1. **User enters connection details** in the web form (gateway host/port, RDP host/port, optional credentials)
2. **Browser establishes WebSocket** connection to the gateway at `ws://{gateway}:{port}/rdp`
3. **Connection parameters** (hostname, port, username, password) are passed via the Guacamole protocol
4. **Backend connects to guacd** and forwards the RDP configuration
5. **guacd establishes RDP connection** to the target Windows machine
6. **Display data streams back** through the chain to the browser
7. **User input (keyboard/mouse)** is sent back through the tunnel to the RDP server

## Troubleshooting

### Connection fails immediately

- Ensure the **gateway** (Spring Boot backend) is running and reachable
- Ensure guacd is running: `docker ps | grep guacd`
- Check guacd logs: `docker logs guacd`
- Verify the RDP server is accessible from the machine running the backend (guacd connects via the backend host)

### "Invalid hostname" error

- For **Gateway**: ensure the backend hostname/port is correct (e.g. `localhost:9460` for local dev)
- For **Server**: ensure you've entered a valid RDP hostname or IP address
- The RDP hostname must be reachable from the machine running the backend/guacd

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


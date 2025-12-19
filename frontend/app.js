/**
 * WebRDP Client Application
 * Handles Guacamole connection and user interface
 */

(function () {
  "use strict";

  // Configuration
  const CONFIG = {
    wsPath: "/rdp",
    reconnectAttempts: 3,
    reconnectDelay: 2000,
  };

  // State
  let guacClient = null;
  let tunnel = null;
  let keyboard = null;
  let mouse = null;
  let isConnected = false;

  // DOM Elements
  const elements = {
    connectionForm: document.getElementById("connectionForm"),
    connectionPanel: document.getElementById("connectionPanel"),
    displayContainer: document.getElementById("displayContainer"),
    displayWrapper: document.getElementById("displayWrapper"),
    display: document.getElementById("display"),
    placeholder: document.getElementById("placeholder"),
    loadingOverlay: document.getElementById("loadingOverlay"),
    statusIndicator: document.getElementById("statusIndicator"),
    connectBtn: document.getElementById("connectBtn"),
    disconnectBtn: document.getElementById("disconnectBtn"),
    panelToggle: document.getElementById("panelToggle"),
    togglePassword: document.getElementById("togglePassword"),
    gatewayHostname: document.getElementById("gatewayHostname"),
    gatewayPort: document.getElementById("gatewayPort"),
    hostname: document.getElementById("hostname"),
    port: document.getElementById("port"),
    username: document.getElementById("username"),
    password: document.getElementById("password"),
  };

  /**
   * Initialize the application
   */
  function init() {
    bindEvents();
    updateStatus("disconnected", "Disconnected");
  }

  /**
   * Bind UI event listeners
   */
  function bindEvents() {
    // Form submission
    elements.connectionForm.addEventListener("submit", handleConnect);

    // Disconnect button
    elements.disconnectBtn.addEventListener("click", handleDisconnect);

    // Panel toggle
    elements.panelToggle.addEventListener("click", togglePanel);

    // Password visibility toggle
    elements.togglePassword.addEventListener("click", togglePasswordVisibility);

    // Window resize handler
    window.addEventListener("resize", handleResize);

    // Prevent form elements from capturing keyboard when connected
    elements.connectionForm.addEventListener("keydown", (e) => {
      if (isConnected && e.target.tagName !== "INPUT") {
        e.preventDefault();
      }
    });
  }

  /**
   * Handle connection form submission
   */
  function handleConnect(event) {
    event.preventDefault();

    const gatewayHostname = elements.gatewayHostname.value.trim();
    const gatewayPort = elements.gatewayPort.value || "8080";
    const hostname = elements.hostname.value.trim();
    const port = elements.port.value || "3389";
    const username = elements.username.value.trim();
    const password = elements.password.value;

    if (!gatewayHostname) {
      showError("Please enter a gateway hostname or IP address");
      return;
    }

    if (!hostname) {
      showError("Please enter a server hostname or IP address");
      return;
    }

    connect(gatewayHostname, gatewayPort, hostname, port, username, password);
  }

  /**
   * Establish RDP connection via Guacamole
   */
  function connect(
    gatewayHostname,
    gatewayPort,
    hostname,
    port,
    username,
    password
  ) {
    // Show loading state
    showLoading(true);
    updateStatus("connecting", "Connecting...");
    toggleButtons(false);

    try {
      // Build WebSocket URL with connection parameters
      const params = new URLSearchParams({
        hostname: hostname,
        port: port,
      });

      if (username) params.append("username", username);
      if (password) params.append("password", password);

      // Build WebSocket URL from gateway settings
      const wsUrl = `ws://${gatewayHostname}:${gatewayPort}${CONFIG.wsPath}`;

      // Create Guacamole tunnel
      tunnel = new Guacamole.WebSocketTunnel(wsUrl);

      // Add tunnel error/state handlers
      tunnel.onerror = function (status) {
        console.error("Tunnel error:", status);
      };

      tunnel.onstatechange = function (state) {
        console.log("Tunnel state:", state);
      };

      // Create Guacamole client
      guacClient = new Guacamole.Client(tunnel);

      // Set up event handlers
      setupClientHandlers();

      // Get display element and add to DOM
      const displayElement = guacClient.getDisplay().getElement();
      elements.display.innerHTML = "";
      elements.display.appendChild(displayElement);

      // Connect - pass connection parameters through Guacamole protocol
      guacClient.connect(params.toString());
    } catch (error) {
      console.error("Connection error:", error);
      showError("Failed to establish connection: " + error.message);
      handleDisconnect();
    }
  }

  /**
   * Set up Guacamole client event handlers
   */
  function setupClientHandlers() {
    // Connection state change
    guacClient.onstatechange = function (state) {
      console.log("Client state changed to:", state);
      switch (state) {
        case Guacamole.Client.State.IDLE:
          console.log("Client idle");
          break;

        case Guacamole.Client.State.CONNECTING:
          console.log("Connecting...");
          updateStatus("connecting", "Connecting...");
          break;

        case Guacamole.Client.State.WAITING:
          console.log("Waiting for server...");
          updateStatus("connecting", "Waiting for server...");
          break;

        case Guacamole.Client.State.CONNECTED:
          console.log("Connected!");
          onConnected();
          break;

        case Guacamole.Client.State.DISCONNECTING:
          console.log("Disconnecting...");
          updateStatus("connecting", "Disconnecting...");
          break;

        case Guacamole.Client.State.DISCONNECTED:
          console.log("Disconnected");
          onDisconnected();
          break;
      }
    };

    // Error handler
    guacClient.onerror = function (error) {
      console.error("Guacamole error:", error);
      showError("Connection error: " + (error.message || "Unknown error"));
    };

    // Audio support
    guacClient.onaudio = function (stream, mimetype) {
      console.log("Audio stream received:", mimetype);
      const audio = new Guacamole.AudioPlayer(stream, mimetype);
      return audio;
    };

    // Clipboard handling (optional - log only since we don't need clipboard)
    guacClient.onclipboard = function (stream, mimetype) {
      console.log("Clipboard data received");
    };

    // Handle display resize
    guacClient.getDisplay().onresize = function (width, height) {
      console.log("Display resized:", width, "x", height);
      centerDisplay();
    };
  }

  /**
   * Called when connection is established
   */
  function onConnected() {
    isConnected = true;
    showLoading(false);
    elements.placeholder.classList.add("hidden");
    updateStatus("connected", "Connected");
    toggleButtons(true);

    // Collapse panel for more screen space
    elements.connectionPanel.classList.add("collapsed");

    // Set up input handlers
    setupInputHandlers();

    // Initial display sizing
    handleResize();

    // Focus the display for keyboard input
    elements.display.focus();
  }

  /**
   * Called when connection is closed
   */
  function onDisconnected() {
    isConnected = false;
    showLoading(false);
    elements.placeholder.classList.remove("hidden");
    updateStatus("disconnected", "Disconnected");
    toggleButtons(false);

    // Clean up input handlers
    cleanupInputHandlers();

    // Show panel
    elements.connectionPanel.classList.remove("collapsed");
  }

  /**
   * Set up keyboard and mouse input handlers
   */
  function setupInputHandlers() {
    const displayElement = elements.display;

    // Keyboard
    keyboard = new Guacamole.Keyboard(document);

    keyboard.onkeydown = function (keysym) {
      if (guacClient) {
        guacClient.sendKeyEvent(1, keysym);
      }
    };

    keyboard.onkeyup = function (keysym) {
      if (guacClient) {
        guacClient.sendKeyEvent(0, keysym);
      }
    };

    // Mouse
    mouse = new Guacamole.Mouse(displayElement);

    mouse.onmousedown =
      mouse.onmouseup =
      mouse.onmousemove =
        function (mouseState) {
          if (guacClient) {
            // Scale mouse position to match display scaling
            const display = guacClient.getDisplay();
            const scale = display.getScale();

            const scaledState = new Guacamole.Mouse.State(
              mouseState.x / scale,
              mouseState.y / scale,
              mouseState.left,
              mouseState.middle,
              mouseState.right,
              mouseState.up,
              mouseState.down
            );

            guacClient.sendMouseState(scaledState);
          }
        };

    // Touch support for mobile
    const touch = new Guacamole.Mouse.Touchpad(displayElement);
    touch.onmousedown = touch.onmouseup = touch.onmousemove = mouse.onmousemove;

    // Make display focusable
    displayElement.setAttribute("tabindex", "0");
    displayElement.focus();
  }

  /**
   * Clean up input handlers
   */
  function cleanupInputHandlers() {
    if (keyboard) {
      keyboard.onkeydown = null;
      keyboard.onkeyup = null;
      keyboard = null;
    }

    if (mouse) {
      mouse.onmousedown = null;
      mouse.onmouseup = null;
      mouse.onmousemove = null;
      mouse = null;
    }
  }

  /**
   * Handle disconnect
   */
  function handleDisconnect() {
    if (guacClient) {
      guacClient.disconnect();
      guacClient = null;
    }

    if (tunnel) {
      tunnel = null;
    }

    cleanupInputHandlers();
    onDisconnected();
  }

  /**
   * Handle window resize
   */
  function handleResize() {
    if (!guacClient || !isConnected) return;

    const display = guacClient.getDisplay();
    const container = elements.displayWrapper;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Calculate optimal scale
    const displayWidth = display.getWidth();
    const displayHeight = display.getHeight();

    if (displayWidth && displayHeight) {
      const scaleX = containerWidth / displayWidth;
      const scaleY = containerHeight / displayHeight;
      const scale = Math.min(scaleX, scaleY, 1); // Don't scale up

      display.scale(scale);
      centerDisplay();
    }
  }

  /**
   * Center the remote display in the container
   */
  function centerDisplay() {
    // Display is centered via CSS flexbox
  }

  /**
   * Toggle sidebar panel
   */
  function togglePanel() {
    elements.connectionPanel.classList.toggle("collapsed");
  }

  /**
   * Toggle password field visibility
   */
  function togglePasswordVisibility() {
    const passwordInput = elements.password;
    const eyeIcon = elements.togglePassword.querySelector(".eye-icon");
    const eyeOffIcon = elements.togglePassword.querySelector(".eye-off-icon");

    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      eyeIcon.classList.add("hidden");
      eyeOffIcon.classList.remove("hidden");
    } else {
      passwordInput.type = "password";
      eyeIcon.classList.remove("hidden");
      eyeOffIcon.classList.add("hidden");
    }
  }

  /**
   * Update connection status indicator
   */
  function updateStatus(state, text) {
    const indicator = elements.statusIndicator;
    const statusText = indicator.querySelector(".status-text");

    indicator.className = "status-indicator " + state;
    statusText.textContent = text;
  }

  /**
   * Toggle connect/disconnect buttons
   */
  function toggleButtons(connected) {
    if (connected) {
      elements.connectBtn.classList.add("hidden");
      elements.disconnectBtn.classList.remove("hidden");
    } else {
      elements.connectBtn.classList.remove("hidden");
      elements.disconnectBtn.classList.add("hidden");
    }
  }

  /**
   * Show/hide loading overlay
   */
  function showLoading(show) {
    if (show) {
      elements.loadingOverlay.classList.remove("hidden");
    } else {
      elements.loadingOverlay.classList.add("hidden");
    }
  }

  /**
   * Show error message
   */
  function showError(message) {
    console.error(message);
    updateStatus("error", message);

    // Reset status after delay
    setTimeout(() => {
      if (!isConnected) {
        updateStatus("disconnected", "Disconnected");
      }
    }, 5000);
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

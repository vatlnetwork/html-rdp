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
  let isFullscreen = false;
  let originalWidth = null;
  let originalHeight = null;
  let resizeTimeout = null;

  // Error log (console + network errors since page load)
  const errorLog = [];
  const originalConsoleError = console.error;

  /**
   * Convert any value to a readable string for the error log (avoids [object Object])
   */
  function toLogString(value) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") return value;
    if (value instanceof Error) {
      return (
        (value.message || "Error") + (value.stack ? "\n" + value.stack : "")
      );
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch (e) {
        return Object.prototype.toString.call(value);
      }
    }
    return String(value);
  }

  // DOM Elements
  const elements = {
    connectionForm: document.getElementById("connectionForm"),
    connectionPanel: document.getElementById("connectionPanel"),
    displayContainer: document.getElementById("displayContainer"),
    displayWrapper: document.getElementById("displayWrapper"),
    display: document.getElementById("display"),
    displayToolbar: document.getElementById("displayToolbar"),
    placeholder: document.getElementById("placeholder"),
    loadingOverlay: document.getElementById("loadingOverlay"),
    statusIndicator: document.getElementById("statusIndicator"),
    connectBtn: document.getElementById("connectBtn"),
    disconnectBtn: document.getElementById("disconnectBtn"),
    panelToggle: document.getElementById("panelToggle"),
    togglePassword: document.getElementById("togglePassword"),
    fullscreenBtn: document.getElementById("fullscreenBtn"),
    fitToWindowBtn: document.getElementById("fitToWindowBtn"),
    actualSizeBtn: document.getElementById("actualSizeBtn"),
    gatewayHostname: document.getElementById("gatewayHostname"),
    gatewayPort: document.getElementById("gatewayPort"),
    hostname: document.getElementById("hostname"),
    port: document.getElementById("port"),
    username: document.getElementById("username"),
    password: document.getElementById("password"),
    errorLogBtn: document.getElementById("errorLogBtn"),
    errorLogModal: document.getElementById("errorLogModal"),
    errorLogList: document.getElementById("errorLogList"),
    errorLogEmpty: document.getElementById("errorLogEmpty"),
    errorLogClearBtn: document.getElementById("errorLogClearBtn"),
    errorLogCloseBtn: document.getElementById("errorLogCloseBtn"),
  };

  /**
   * Add an entry to the error log and update the button state
   */
  function addErrorLogEntry(type, message, meta) {
    const entry = {
      type: type,
      message: toLogString(message),
      meta: meta || {},
      time: new Date().toISOString(),
    };
    errorLog.push(entry);
    updateErrorLogButton();
  }

  /**
   * Update error log button outline (red when there are errors)
   */
  function updateErrorLogButton() {
    if (!elements.errorLogBtn) return;
    if (errorLog.length > 0) {
      elements.errorLogBtn.classList.add("has-errors");
    } else {
      elements.errorLogBtn.classList.remove("has-errors");
    }
  }

  /**
   * Open the error log modal and render entries
   */
  function openErrorLogModal() {
    if (!elements.errorLogModal) return;
    elements.errorLogModal.classList.remove("hidden");
    elements.errorLogModal.setAttribute("aria-hidden", "false");
    renderErrorLog();
    elements.errorLogCloseBtn.focus();
  }

  /**
   * Close the error log modal
   */
  function closeErrorLogModal() {
    if (!elements.errorLogModal) return;
    elements.errorLogModal.classList.add("hidden");
    elements.errorLogModal.setAttribute("aria-hidden", "true");
  }

  /**
   * Render error log entries into the list
   */
  function renderErrorLog() {
    const list = elements.errorLogList;
    const empty = elements.errorLogEmpty;
    if (!list || !empty) return;

    list.innerHTML = "";
    if (errorLog.length === 0) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    errorLog.forEach(function (entry) {
      const li = document.createElement("li");
      li.textContent = entry.message;
      if (entry.meta.url || entry.time) {
        const meta = document.createElement("div");
        meta.className = "error-meta";
        const parts = [];
        if (entry.meta.url) parts.push(entry.meta.url);
        if (entry.time) parts.push(entry.time);
        meta.textContent = parts.join(" · ");
        li.appendChild(meta);
      }
      list.appendChild(li);
    });
  }

  /**
   * Clear the error log and update UI
   */
  function clearErrorLog() {
    errorLog.length = 0;
    updateErrorLogButton();
    renderErrorLog();
    if (elements.errorLogEmpty)
      elements.errorLogEmpty.classList.remove("hidden");
  }

  /**
   * Install console.error and network error capture
   */
  function initErrorLog() {
    console.error = function () {
      const message = Array.prototype.slice
        .call(arguments)
        .map(function (a) {
          return toLogString(a);
        })
        .join(" ");
      addErrorLogEntry("console", message, {});
      originalConsoleError.apply(console, arguments);
    };

    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = function () {
        const args = arguments;
        return originalFetch.apply(this, args).then(
          function (response) {
            if (!response.ok) {
              addErrorLogEntry(
                "network",
                "Request failed: " +
                  response.status +
                  " " +
                  response.statusText,
                { url: response.url },
              );
            }
            return response;
          },
          function (err) {
            const url =
              typeof args[0] === "string"
                ? args[0]
                : (args[0] && args[0].url) || "";
            addErrorLogEntry("network", err || "Network request failed", {
              url: url,
            });
            throw err;
          },
        );
      };
    }

    window.addEventListener("error", function (event) {
      const message =
        event.message ||
        (event.error != null ? toLogString(event.error) : null) ||
        "Unknown error";
      const meta = {};
      if (event.filename) meta.url = event.filename;
      addErrorLogEntry(event.error ? "console" : "resource", message, meta);
    });

    if (elements.errorLogBtn) {
      elements.errorLogBtn.addEventListener("click", openErrorLogModal);
    }
    if (elements.errorLogCloseBtn) {
      elements.errorLogCloseBtn.addEventListener("click", closeErrorLogModal);
    }
    if (elements.errorLogClearBtn) {
      elements.errorLogClearBtn.addEventListener("click", clearErrorLog);
    }
    if (elements.errorLogModal) {
      elements.errorLogModal.addEventListener("click", function (e) {
        if (e.target === elements.errorLogModal) closeErrorLogModal();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (
        e.key === "Escape" &&
        elements.errorLogModal &&
        !elements.errorLogModal.classList.contains("hidden")
      ) {
        closeErrorLogModal();
      }
    });
  }

  /**
   * Initialize the application
   */
  function init() {
    initErrorLog();
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

    // Toolbar buttons
    elements.fullscreenBtn.addEventListener("click", toggleFullscreen);
    elements.fitToWindowBtn.addEventListener("click", fitToWindow);
    elements.actualSizeBtn.addEventListener("click", actualSize);

    // Window resize handler
    window.addEventListener("resize", handleResize);

    // Fullscreen change handler (for browser fullscreen API)
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    // Keyboard shortcut for fullscreen (F11)
    document.addEventListener("keydown", (e) => {
      if (e.key === "F11" && isConnected) {
        e.preventDefault();
        toggleFullscreen();
      }
      // Escape to exit fullscreen
      if (e.key === "Escape" && isFullscreen) {
        exitFullscreen();
      }
    });

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
    password,
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
        const detail =
          status && (status.message != null || status.code != null)
            ? status.message || String(status.code)
            : toLogString(status);
        addErrorLogEntry("network", "Tunnel error: " + detail, {});
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
      const msg =
        error.message || (typeof error === "string" ? error : "Unknown error");
      addErrorLogEntry("network", "Connection error: " + msg, {});
      console.error("Guacamole error:", error);
      showError("Connection error: " + msg);
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
    elements.displayToolbar.classList.remove("hidden");
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
    elements.displayToolbar.classList.add("hidden");
    updateStatus("disconnected", "Disconnected");
    toggleButtons(false);

    // Exit fullscreen if active
    if (isFullscreen) {
      exitFullscreen();
    }

    // Reset stored resolution
    originalWidth = null;
    originalHeight = null;

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
              mouseState.down,
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

    // Immediately scale to fit
    fitToWindow();

    // Debounce resolution updates to avoid spamming the server
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    resizeTimeout = setTimeout(() => {
      updateDisplayResolution();
    }, 500);
  }

  /**
   * Fit display to available window space
   */
  function fitToWindow() {
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
      const scale = Math.min(scaleX, scaleY); // Allow scaling up in fullscreen

      display.scale(scale);
      centerDisplay();
    }
  }

  /**
   * Show display at actual size (1:1 scale)
   */
  function actualSize() {
    if (!guacClient || !isConnected) return;

    const display = guacClient.getDisplay();
    display.scale(1);
    centerDisplay();
  }

  /**
   * Toggle fullscreen mode
   */
  function toggleFullscreen() {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }

  /**
   * Enter fullscreen mode
   */
  function enterFullscreen() {
    const container = elements.displayContainer;

    // Try native browser fullscreen first
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (container.mozRequestFullScreen) {
      container.mozRequestFullScreen();
    } else if (container.msRequestFullscreen) {
      container.msRequestFullscreen();
    } else {
      // Fallback to CSS fullscreen
      applyFullscreenStyles(true);
    }
  }

  /**
   * Exit fullscreen mode
   */
  function exitFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    } else {
      // Fallback CSS fullscreen
      applyFullscreenStyles(false);
    }
  }

  /**
   * Handle browser fullscreen change event
   */
  function handleFullscreenChange() {
    const isNowFullscreen = !!(
      document.fullscreenElement || document.webkitFullscreenElement
    );
    applyFullscreenStyles(isNowFullscreen);
  }

  /**
   * Apply or remove fullscreen styles
   */
  function applyFullscreenStyles(fullscreen) {
    isFullscreen = fullscreen;
    const container = elements.displayContainer;
    const enterIcon = elements.fullscreenBtn.querySelector(
      ".fullscreen-enter-icon",
    );
    const exitIcon = elements.fullscreenBtn.querySelector(
      ".fullscreen-exit-icon",
    );

    if (fullscreen) {
      container.classList.add("fullscreen");
      enterIcon.classList.add("hidden");
      exitIcon.classList.remove("hidden");
      elements.fullscreenBtn.classList.add("active");
    } else {
      container.classList.remove("fullscreen");
      enterIcon.classList.remove("hidden");
      exitIcon.classList.add("hidden");
      elements.fullscreenBtn.classList.remove("active");
    }

    // Resize display after a short delay to allow CSS transitions
    setTimeout(() => {
      updateDisplayResolution();
    }, 100);
  }

  /**
   * Update the RDP display resolution to match the container size
   */
  function updateDisplayResolution() {
    if (!guacClient || !isConnected) return;

    const display = guacClient.getDisplay();
    const container = elements.displayWrapper;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Store original resolution on first call
    if (originalWidth === null && display.getWidth()) {
      originalWidth = display.getWidth();
      originalHeight = display.getHeight();
    }

    let targetWidth, targetHeight;

    if (isFullscreen) {
      // In fullscreen, request the full screen resolution
      targetWidth = window.screen.width;
      targetHeight = window.screen.height;
    } else {
      // In windowed mode, match the container size
      targetWidth = containerWidth;
      targetHeight = containerHeight;
    }

    // Round to avoid fractional pixels
    targetWidth = Math.floor(targetWidth);
    targetHeight = Math.floor(targetHeight);

    // Only send if resolution actually changed
    const currentWidth = display.getWidth();
    const currentHeight = display.getHeight();

    if (targetWidth !== currentWidth || targetHeight !== currentHeight) {
      console.log(
        "Requesting resolution change:",
        currentWidth + "x" + currentHeight,
        "->",
        targetWidth + "x" + targetHeight,
      );
      guacClient.sendSize(targetWidth, targetHeight);
    }

    // Also scale to fit after resize
    setTimeout(() => {
      fitToWindow();
    }, 200);
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

import React from "react";

/**
 * Top-level error boundary. Without one, any render-time exception in a child
 * (e.g. timeline SVG rendering, confetti, audio UI) unmounts the whole React
 * tree and the user sees a blank screen. This catches the error and offers a
 * reload instead.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Surface to the console; the existing debugLogger forwards console output
    // to the backend when debug logging is enabled.
    console.error("[ErrorBoundary] Caught render error:", error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          color: "#fff",
          background: "#0b0b0f",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ opacity: 0.8, maxWidth: "28rem" }}>
          The game hit an unexpected error. Reloading usually fixes it — your
          session will be restored if a game is still in progress.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#7D3BED",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;

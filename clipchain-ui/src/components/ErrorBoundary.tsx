import React from "react";

type State = { hasError: boolean; error?: Error | null; info?: React.ErrorInfo | null };

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // You can also log to remote error service here
    // console.error is useful during dev
    console.error("Uncaught error in component tree:", error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: "#fff", background: "#1f2937", minHeight: "100vh" }}>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap", color: "#ffb86b" }}>
            {this.state.error?.message}
            {"\n"}
            {this.state.info?.componentStack}
          </pre>
          <p style={{ opacity: 0.8 }}>Open DevTools console for full trace.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
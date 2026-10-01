import { Component } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Route-level error boundary. A page that throws while rendering shows a
// recoverable state here instead of blanking the whole application.
// Must be rendered inside the router so the fallback can use Link.
// Give it a `key` that changes with the route to clear a captured failure.
export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the console trail for the support desk, mirroring ActivityLog.
    console.error("Page failed to render:", error, info?.componentStack);
  }

  retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="bp-state bp-state-error">
        <AlertTriangle />
        <strong>This page could not be displayed</strong>
        <p>
          The rest of the application is still usable. Try again, or return to
          your dashboard.
        </p>
        {error?.message && (
          <p className="bp-crash-detail">{String(error.message)}</p>
        )}
        <div className="bp-crash-actions">
          <button
            type="button"
            onClick={this.retry}
            className="bp-button bp-button-primary"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
          <Link to="/dashboard" className="bp-button bp-button-secondary">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }
}

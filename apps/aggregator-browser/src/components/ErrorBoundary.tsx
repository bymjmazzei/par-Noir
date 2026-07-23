/**
 * Error Boundary Component
 * Catches React errors and displays a fallback UI
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { captureReactError } from '../config/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    captureReactError(error, errorInfo.componentStack ?? undefined);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 flex items-center justify-center p-4">
          <div className="bg-neutral-900 rounded-xl border border-neutral-700 max-w-2xl w-full p-8 text-center">
            <AlertTriangle className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-text-secondary mb-6">
              The application encountered an unexpected error. Don't worry, your data is safe.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 text-left">
                <p className="text-red-400 text-sm font-mono mb-2">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <details className="text-xs text-text-secondary">
                    <summary className="cursor-pointer mb-2">Stack Trace</summary>
                    <pre className="overflow-auto text-xs">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex items-center justify-center space-x-4">
              <button
                onClick={this.handleReset}
                className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Reload Page</span>
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-3 bg-neutral-700 text-white font-medium rounded-lg hover:bg-neutral-600 transition-colors flex items-center space-x-2"
              >
                <Home className="h-4 w-4" />
                <span>Go Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


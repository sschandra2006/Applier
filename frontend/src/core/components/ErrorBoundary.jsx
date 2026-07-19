import React from 'react';
import { AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-gray-100 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {this.state.error?.isRetryable ? 'Temporary Connection Issue' : 'Application Error'}
            </h1>
            <p className="text-gray-500 mb-6">
              {this.state.error?.userMessage || this.state.error?.message || "We've encountered an unexpected error. Please try refreshing the page."}
            </p>
            <button
              onClick={this.handleReset}
              className="w-full bg-black hover:bg-gray-800 text-white font-medium py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
            >
              Return to Home
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mt-6 w-full text-left bg-gray-100 p-4 rounded text-xs text-red-800 overflow-auto max-h-48 border border-gray-200">
                <p className="font-semibold">{this.state.error.toString()}</p>
                <p className="whitespace-pre-wrap mt-2">{this.state.errorInfo?.componentStack}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

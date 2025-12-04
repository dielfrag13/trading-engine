import React, { type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          padding: '32px',
          backgroundColor: '#1a202c',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          color: '#e2e8f0',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{
            backgroundColor: '#742a2a',
            padding: '16px',
            borderRadius: '6px',
          }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold', color: '#fce7f3' }}>
              Something went wrong
            </h2>
            <p style={{ margin: '0', fontSize: '14px', color: '#fbcfe8' }}>
              {this.state.error?.message}
            </p>
          </div>
          <pre style={{
            backgroundColor: '#2d3748',
            padding: '16px',
            borderRadius: '6px',
            overflow: 'auto',
            maxHeight: '400px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#cbd5e0',
            margin: '0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

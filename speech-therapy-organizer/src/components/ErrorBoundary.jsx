import React from 'react'

// Catches render-time errors so a bug in one screen shows a recoverable message
// instead of a blank white window. Your saved data is untouched — the crash is
// only in the on-screen display, not the file on disk.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('Render error caught by ErrorBoundary:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="crash-screen">
          <div className="crash-icon">⚠️</div>
          <h1>Something went wrong on this screen</h1>
          <p>Your saved data is safe — this only affects what's on screen right now.</p>
          <pre className="crash-detail">{String(this.state.error?.message || this.state.error)}</pre>
          <button className="btn-primary" onClick={() => this.setState({ error: null })}>Try Again</button>
          <button className="btn-secondary" onClick={() => window.location.reload()}>Reload App</button>
        </div>
      )
    }
    return this.props.children
  }
}

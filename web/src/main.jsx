import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
import './extra.css';

class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ textAlign: 'center', fontFamily: 'Arial, sans-serif', padding: '60px 20px', color: '#333' }}>
          <h2>Something went wrong</h2>
          <p>Please refresh the page.</p>
          <button onClick={() => window.location.reload()}
            style={{ padding: '8px 24px', borderRadius: '999px', border: 'none', background: '#8B1111', color: '#fff', fontSize: '15px', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>
);

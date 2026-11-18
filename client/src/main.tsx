import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

async function renderApp(): Promise<void> {
  let content = <App />;
  // Vite exposes only VITE_ variables to the browser. The DSN is public config.
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (sentryDsn) {
    try {
      const Sentry = await import('@sentry/react');
      Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
      });
      content = (
        <Sentry.ErrorBoundary fallback={<p role="alert">Something went wrong. Please reload the page.</p>}>
          <App />
        </Sentry.ErrorBoundary>
      );
    } catch {
      console.warn('[SharVin] Error tracking is unavailable. Check the Sentry SDK and configuration.');
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>{content}</React.StrictMode>
  );
}

void renderApp();

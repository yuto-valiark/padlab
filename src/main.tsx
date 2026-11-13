import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/unbounded/400.css';
import '@fontsource/unbounded/700.css';
import '@fontsource/unbounded/900.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles.css';
import App from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

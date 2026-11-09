import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerServiceWorker } from './sw/register';
import { App } from './ui/App';
import '@fontsource-variable/geist/wght.css';
import './ui/app.css';
import './ui/gym.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the offline shell only in the production build;
// in development it would serve stale files and hide code changes
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  registerServiceWorker();
}

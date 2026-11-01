import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyAppTheme, getAppTheme } from './services/tenantService';

applyAppTheme(getAppTheme());

createRoot(document.getElementById('root')!).render(<App />);

// PWA updates: check the worker on startup/return to foreground and reload once
// when a newly activated worker takes control. No user uninstall/reinstall needed.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
      const checkForUpdate = () => {
        if (navigator.onLine) registration.update().catch(() => {});
      };
      checkForUpdate();
      window.addEventListener('focus', checkForUpdate);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkForUpdate();
      });
      window.setInterval(checkForUpdate, 60 * 60 * 1000);
    }).catch(() => {});
  });
}

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyAppTheme, getAppTheme } from './services/tenantService';

applyAppTheme(getAppTheme());

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

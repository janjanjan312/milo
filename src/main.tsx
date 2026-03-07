import {registerSW} from 'virtual:pwa-register';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

registerSW({immediate: true});

const savedFontSize = localStorage.getItem('app_font_size');
const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
document.documentElement.style.fontSize = savedFontSize ? `${savedFontSize}px` : (isStandalone ? '18px' : '');

if (isStandalone) {
  document.addEventListener('touchend', (e) => {
    const el = e.target;
    if (el instanceof HTMLElement && el.isContentEditable) {
      el.focus();
    } else if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text')) {
      el.focus();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

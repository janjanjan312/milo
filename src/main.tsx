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
    const el = e.target as HTMLElement;
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text')) {
      (el as HTMLTextAreaElement).focus();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

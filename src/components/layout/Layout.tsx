import { ReactNode, useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { MessageSquare, ClipboardList, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { translations } from '../../translations';

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'submit', 'button', 'file', 'hidden', 'range'].includes((el as HTMLInputElement).type));
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isEditable(e.target)) setVisible(true);
    };
    const onFocusOut = () => {
      setTimeout(() => {
        if (!isEditable(document.activeElement)) setVisible(false);
      }, 50);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return visible;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { language } = useApp();
  const t = translations[language];
  const keyboardUp = useKeyboardVisible();

  return (
    <div className="flex flex-col h-[100dvh] sm:h-full bg-stone-50 text-stone-900 font-sans relative">
      <main className="flex-1 overflow-auto min-h-0" style={{ paddingBottom: keyboardUp ? 0 : undefined }}>
        {children}
      </main>

      <nav
        className={`bg-white border-t border-stone-200 px-6 pt-3 flex justify-around items-center z-50 transition-transform duration-200 ${
          keyboardUp ? 'translate-y-full pointer-events-none' : 'translate-y-0'
        }`}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <NavItem to="/chat" icon={<MessageSquare size={24} />} label={t.nav.chat} />
        <NavItem to="/record" icon={<ClipboardList size={24} />} label={t.nav.record} />
        <NavItem to="/me" icon={<User size={24} />} label={t.nav.me} />
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink 
      to={to} 
      className={({ isActive }) => `
        flex flex-col items-center gap-1 transition-colors duration-200
        ${isActive ? 'text-stone-900' : 'text-stone-400 hover:text-stone-600'}
      `}
    >
      {icon}
      <span className="text-[10px] font-medium tracking-wide uppercase">{label}</span>
    </NavLink>
  );
}

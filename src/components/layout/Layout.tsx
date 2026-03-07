import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { MessageSquare, ClipboardList, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { translations } from '../../translations';

export default function Layout({ children }: { children: ReactNode }) {
  const { language } = useApp();
  const t = translations[language];

  return (
    <div className="flex flex-col h-[100dvh] sm:h-full bg-stone-50 text-stone-900 font-sans">
      <main className="flex-1 overflow-auto min-h-0">
        {children}
      </main>
      
      <nav className="bg-white border-t border-stone-200 px-6 pt-3 flex justify-around items-center z-50" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
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

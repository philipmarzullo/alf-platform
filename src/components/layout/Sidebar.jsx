import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUser } from '../../contexts/UserContext';
import useMediaQuery from '../../hooks/useMediaQuery';
import { NAV_ITEMS } from '../../data/constants';
import {
  LayoutDashboard, Building2, Bot, Activity, Settings,
  Menu, X, LogOut,
} from 'lucide-react';

const ICON_MAP = {
  LayoutDashboard, Building2, Bot, Activity, Settings,
};

export default function Sidebar() {
  const location = useLocation();
  const { signOut } = useAuth();
  const { currentUser } = useUser();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = currentUser
    ? `${currentUser.first_name?.[0] || ''}${currentUser.last_name?.[0] || ''}`.toUpperCase() || '?'
    : '?';

  function isActive(path) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  const nav = (
    <aside className={`fixed top-0 left-0 h-screen bg-dark-nav-warm flex flex-col z-40 transition-all duration-200 ${
      isDesktop ? 'w-56' : 'w-64'
    }`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 shrink-0">
        <img src="/alf-logo.jpg" alt="Alf" className="w-8 h-8 rounded-full" />
        <span className="text-sm font-semibold text-white tracking-wide">Alf Platform</span>
        {!isDesktop && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto text-white/60 hover:text-white">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_ITEMS.map((group) => (
          <div key={group.group}>
            <div className="px-3 mb-1 text-[10px] font-bold tracking-widest text-white/40 uppercase">
              {group.group}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICON_MAP[item.icon] || LayoutDashboard;
                const active = isActive(item.path);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-amber-500" />
                    )}
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 px-3 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-amber-500/20 text-amber-400">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">
              {currentUser?.first_name} {currentUser?.last_name}
            </div>
            <div className="text-[10px] text-white/40 truncate">{currentUser?.email}</div>
          </div>
          <button
            onClick={signOut}
            className="text-white/40 hover:text-white transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );

  if (isDesktop) {
    return (
      <>
        {nav}
        <div className="w-56 shrink-0" />
      </>
    );
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-dark-nav-warm text-white md:hidden"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setMobileOpen(false)} />
          {nav}
        </>
      )}
    </>
  );
}

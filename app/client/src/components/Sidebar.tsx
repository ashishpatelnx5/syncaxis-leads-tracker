import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Logo } from './Logo';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { HomeIcon, LeadsIcon, CustomersIcon, AdminIcon, LogoutIcon, MonitorIcon, SunIcon, MoonIcon, TeamPerformanceIcon, ChevronRightIcon } from './icons';

const THEME_ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const;
const THEME_LABEL = { system: 'Theme: System (click for Light)', light: 'Theme: Light (click for Dark)', dark: 'Theme: Dark (click for System)' } as const;

const BASE_NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true, Icon: HomeIcon },
  { to: '/team-performance', label: 'Team Performance', end: false, Icon: TeamPerformanceIcon },
  { to: '/leads', label: 'Leads', end: false, Icon: LeadsIcon },
  { to: '/customers', label: 'Customers', end: false, Icon: CustomersIcon },
];
const ADMIN_SUB_ITEMS = [
  { to: '/admin/leads', label: 'Leads' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/audit-log', label: 'Audit Log' },
];

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();
  const { mode, cycleTheme } = useTheme();
  const location = useLocation();
  const ThemeIcon = THEME_ICON[mode];
  const isAdminSection = location.pathname.startsWith('/admin');
  const [adminOpen, setAdminOpen] = useState(isAdminSection);

  // Auto-expand when navigation (e.g. a deep link) lands inside /admin/*,
  // without fighting a manual collapse the user made while already there.
  useEffect(() => {
    if (isAdminSection) setAdminOpen(true);
  }, [isAdminSection]);

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-top">
        <Logo />
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <span className="sidebar-avatar">{(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}</span>
          <span>{user?.displayName || user?.username}</span>
        </div>
        <div className="sidebar-icon-group">
          <button className="sidebar-icon-btn" onClick={cycleTheme} title={THEME_LABEL[mode]} aria-label={THEME_LABEL[mode]}>
            <ThemeIcon />
          </button>
          <button className="sidebar-icon-btn" onClick={logout} title="Sign out" aria-label="Sign out">
            <LogoutIcon />
          </button>
        </div>
      </div>

      <nav className="sidebar-nav">
        {BASE_NAV_ITEMS.map(({ to, label, end, Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')} onClick={onNavigate}>
            <Icon />
            {label}
          </NavLink>
        ))}

        {user?.isAdmin && (
          <div className="sidebar-nav-group">
            <button
              type="button"
              className={`sidebar-nav-parent${isAdminSection ? ' active' : ''}`}
              onClick={() => setAdminOpen((o) => !o)}
              aria-expanded={adminOpen}
            >
              <AdminIcon />
              Admin
              <ChevronRightIcon className={`sidebar-nav-chevron${adminOpen ? ' open' : ''}`} />
            </button>
            {adminOpen && (
              <div className="sidebar-nav-sub">
                {ADMIN_SUB_ITEMS.map(({ to, label }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')} onClick={onNavigate}>
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
    </aside>
  );
}

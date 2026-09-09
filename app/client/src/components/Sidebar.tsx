import { NavLink } from 'react-router-dom';
import { Logo } from './Logo';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { HomeIcon, LeadsIcon, CustomersIcon, AdminIcon, LogoutIcon, MonitorIcon, SunIcon, MoonIcon } from './icons';

const THEME_ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const;
const THEME_LABEL = { system: 'Theme: System (click for Light)', light: 'Theme: Light (click for Dark)', dark: 'Theme: Dark (click for System)' } as const;

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true, Icon: HomeIcon },
  { to: '/leads', label: 'Leads', end: false, Icon: LeadsIcon },
  { to: '/customers', label: 'Customers', end: false, Icon: CustomersIcon },
  { to: '/admin', label: 'Admin', end: false, Icon: AdminIcon },
];

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { logout } = useAuth();
  const { mode, cycleTheme } = useTheme();
  const ThemeIcon = THEME_ICON[mode];

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-top">
        <Logo />
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <span className="sidebar-avatar">S</span>
          <span>syncaxis</span>
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
        {NAV_ITEMS.map(({ to, label, end, Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')} onClick={onNavigate}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

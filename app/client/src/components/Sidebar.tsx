import { NavLink } from 'react-router-dom';
import { Logo } from './Logo';
import { useAuth } from '../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/leads', label: 'Leads', end: false },
  { to: '/customers', label: 'Customers', end: false },
  { to: '/admin', label: 'Admin', end: false },
];

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { logout } = useAuth();

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
        <button className="btn sidebar-signout" onClick={logout}>Sign out</button>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')} onClick={onNavigate}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

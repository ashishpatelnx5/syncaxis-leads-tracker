import { NavLink } from 'react-router-dom';
import { Logo } from './Logo';
import { useAuth } from '../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/leads', label: 'Leads', end: false },
  { to: '/customers', label: 'Customers', end: false },
];

export function Sidebar() {
  const { logout } = useAuth();

  return (
    <aside className="sidebar">
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
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

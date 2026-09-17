import { NavLink } from 'react-router-dom';

export function AdminTabs() {
  return (
    <nav className="admin-tabs">
      <NavLink to="/admin/leads" className={({ isActive }) => (isActive ? 'active' : '')}>Leads</NavLink>
      <NavLink to="/admin/customers" className={({ isActive }) => (isActive ? 'active' : '')}>Customers</NavLink>
      <NavLink to="/admin/audit-log" className={({ isActive }) => (isActive ? 'active' : '')}>Audit Log</NavLink>
    </nav>
  );
}

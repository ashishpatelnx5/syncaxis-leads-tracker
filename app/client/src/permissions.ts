// Mirrors app/server/src/auth.ts's LEADS_PERM - kept in one place here too so
// a typo in a component's permission check becomes a compile error instead
// of a button that's silently always hidden (or always shown).
export const LEADS_PERM = {
  LEADS_VIEW: 'leads.leads.view',
  LEADS_CREATE: 'leads.leads.create',
  LEADS_UPDATE: 'leads.leads.update',
  LEADS_DELETE: 'leads.leads.delete',
  LEADS_EXPORT: 'leads.leads.export',
  CUSTOMERS_VIEW: 'leads.customers.view',
  CUSTOMERS_CREATE: 'leads.customers.create',
  CUSTOMERS_UPDATE: 'leads.customers.update',
  CUSTOMERS_DELETE: 'leads.customers.delete',
  ADMIN_MANAGE: 'leads.admin.manage',
} as const;

export function hasPermission(user: { perms: string[]; isFullAccess: boolean } | null, key: string): boolean {
  if (!user) return false;
  return user.isFullAccess || user.perms.includes(key);
}

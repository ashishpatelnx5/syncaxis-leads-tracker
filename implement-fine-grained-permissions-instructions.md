# Implementing fine-grained `leads.*` permission checks — requirements & instructions

**Written for:** a Claude Code session working directly inside `F:\Workspace\Syncaxis_Leads_app`. This document is self-contained — it does not assume you have access to `syncaxis-iam`'s or `syncaxis-company-portal`'s conversation history, only to their repos on this machine (`F:\Workspace\syncaxis-iam`, `F:\Workspace\syncaxis-company-portal`, `F:\Workspace\Syncaxis_ERP_Dashboard`) as reference material.

**No changes are needed in `syncaxis-iam` or `syncaxis-company-portal` for this fix.** Both are correct today and stay exactly as they are — see §2. This is a `Syncaxis_Leads_app`-only change.

---

## 1. The problem (verified in production, not theoretical)

A user (`ashish.patel`, via the `Marketing` role) currently has **zero** `leads.*` permissions granted in `syncaxis-iam` — checked directly against the Roles → permission-matrix screen, every `create`/`update`/`delete`/`export` checkbox under `leads.leads` and `leads.customers` is unchecked. Despite that, the same user has full Create/Read/Update/Delete access in this app today (confirmed opening `Edit Lead` and editing fields freely).

Root cause, verified by reading this repo's actual route files:

- `app/server/src/app.ts` mounts every router behind nothing but a blanket `requireAuth`:
  ```ts
  app.use('/api/leads', requireAuth, leadsRouter);
  app.use('/api', requireAuth, followupsRouter);
  app.use('/api', requireAuth, attachmentsRouter);
  app.use('/api/meta', requireAuth, metaRouter);
  app.use('/api/customers', requireAuth, customersRouter);
  app.use('/api/stats', requireAuth, statsRouter);
  ```
- Inside `routes/leads.ts` and `routes/customers.ts`, only the two `DELETE` routes have any further check (`requireLeadsTrackerAdmin` — a single coarse admin/non-admin flag). Every `GET`, `POST` (create), and `PUT` (update) route is open to **any** authenticated user, regardless of what that user's role actually grants in `syncaxis-iam`.
- So "can this user open Leads Tracker at all" and "can this user do anything in it" are currently the same check. There is no per-action enforcement anywhere.

A second, separate issue would block a naive fix: this app currently authenticates via `config.portal.apiUrl` (`syncaxis-company-portal`, `PORTAL_API_URL` in `.env`) — proxying `/login` and `/sso` to Portal's `/api/auth/login` / `/api/auth/sso/exchange`. Portal's own translation layer (`app/server/src/middleware/auth.js`'s `accessFromIamUser`, in the Portal repo) only forwards permission keys matching `^portal\.` — every `leads.*` key from `syncaxis-iam` is silently dropped before it ever reaches this app. So even after adding per-route checks here, there'd be nothing to check against while still going through Portal.

## 2. The fix — talk to `syncaxis-iam` directly, same as `Syncaxis_ERP_Dashboard` already does

**This is not a new/speculative approach — it's already implemented and running in a sibling app.** `F:\Workspace\Syncaxis_ERP_Dashboard\dashboard-app\server.js` already does exactly this: exchanges SSO codes and logins directly against `syncaxis-iam` (bypassing Portal's translation entirely for its own backend session), stores the raw `perms`/`isFullAccess` on its session, and gates routes with a `requirePermission(key)` middleware. Use it as your primary reference — it's proven, not theoretical. Key excerpts (see that file for full context):

```js
const IAM_API_URL = process.env.IAM_API_URL || 'http://localhost:8054';

function hasErpAccess(user) {
  if (!user) return false;
  if (user.isFullAccess) return true;
  return (user.perms || []).some((p) => p.startsWith('erp.'));
}

function requirePermission(key) {
  return (req, res, next) => {
    const perms = req.session.perms || [];
    if (req.session.isFullAccess || perms.includes(key)) return next();
    return res.status(403).json({ error: 'You do not have access to this.' });
  };
}

function establishIamSession(req, user, token) {
  req.session.authenticated = true;
  req.session.username = user.displayName || user.username;
  req.session.iamToken = token;
  req.session.iamVerifiedAt = Date.now();
  req.session.perms = user.perms || [];
  req.session.isFullAccess = !!user.isFullAccess;
}

// SSO handoff — the code in the URL was minted by Portal calling
// syncaxis-iam's own /auth/sso/issue, so it's a genuine syncaxis-iam code;
// exchange it directly against syncaxis-iam, not against Portal.
// POST {IAM_API_URL}/auth/sso/exchange  { code }  ->  { token, user }

// Direct login form
// POST {IAM_API_URL}/auth/login  { username, password }  ->  { token, user }

// Periodic re-verify (5 min cadence, same as today's Portal-based one)
// GET {IAM_API_URL}/auth/me  with  Authorization: Bearer <token>  ->  { user }
```

`user` in every response above already has the shape `{ id, username, displayName, roles, perms: string[], isFullAccess, lastLoginAt }` — see `syncaxis-iam`'s `service/src/routes/auth.ts` `toUserSummary()` if you want to confirm the exact contract, but you shouldn't need to; ERP Dashboard's code already consumes it correctly.

**Why this doesn't touch Portal at all**: Portal's role stays exactly what it already is today — its frontend still mints an SSO code (via its own `/api/auth/sso/issue`, which itself just proxies to `syncaxis-iam`'s `/auth/sso/issue`) and redirects the browser to `<this app>/?ssoCode=...`. What changes is only which backend *this app* calls to redeem that code — `syncaxis-iam` directly instead of through Portal's `/api/auth/sso/exchange`. Portal never sees or cares which one you pick.

### 2.1 Concrete changes in this repo

**`app/server/.env`** — replace:
```diff
-PORTAL_API_URL=http://localhost:8050
+IAM_API_URL=http://localhost:8054
```

**`app/server/src/config.ts`** — replace the `portal.apiUrl` block with `iam.apiUrl` reading `IAM_API_URL` (same shape, same trailing-slash strip).

**`app/server/src/auth.ts`** — this is the bulk of the change:
- `SessionRecord`: replace `portalToken: string; hasAccess: boolean; hasAdminAccess: boolean;` with `iamToken: string; perms: string[]; isFullAccess: boolean;` (keep `userId`, `username`, `displayName`, `lastVerifiedAt`, `expiresAt` as-is).
- Replace `accessFromPortalUser()` with:
  ```ts
  export function accessFromIamUser(user: any): { perms: string[]; isFullAccess: boolean } {
    return { perms: user?.perms || [], isFullAccess: !!user?.isFullAccess };
  }

  export function hasPermission(session: SessionRecord, key: string): boolean {
    return session.isFullAccess || session.perms.includes(key);
  }

  // Replaces the old Portal-application-flag check — "can this user open
  // Leads Tracker at all" is now "do they hold any leads.* permission".
  export function hasAnyLeadsAccess(session: SessionRecord): boolean {
    return session.isFullAccess || session.perms.some((p) => p.startsWith('leads.'));
  }

  export function requirePermission(key: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.session || !hasPermission(req.session, key)) {
        return res.status(403).json({ error: 'You do not have access to this.' });
      }
      next();
    };
  }
  ```
- `reverifyWithPortal` → rename `reverifyWithIam`, point at `${config.iam.apiUrl}/auth/me` instead of Portal's `/api/auth/me`, gate on `hasAnyLeadsAccess(session)` instead of `hasAccess`, and on a successful response refresh `session.perms` / `session.isFullAccess` (not just `displayName`) — this is what makes a permission grant/revoke in `syncaxis-iam` take effect within the existing 5-minute `REVERIFY_INTERVAL_MS`, same cadence as today.
- `requireLeadsTrackerAdmin` — replace its one remaining use-case. Per the analysis already done in this repo's own `leads-integration-instructions.md` §6.4 (still accurate, re-read it before changing this): the two `DELETE` routes get their own dedicated `requirePermission('leads.leads.delete')` / `requirePermission('leads.customers.delete')` instead (§2.2 below), and `leads.admin.manage` becomes purely "is the Admin section visible" — used in `GET /me`'s `isAdmin` field, not as a backend route gate anymore.

**`app/server/src/routes/auth.ts`**:
- `/login`: `fetch(config.iam.apiUrl + '/auth/login', ...)`. On success, `if (!hasAnyLeadsAccess(...))` → 403 with the same `"Sorry! You don't have access to this Portal. Please contact Administrator."` message (keep it verbatim — it's what the frontend/tests already expect). Build the session via `accessFromIamUser(data.user)`, store `iamToken: data.token`.
- `/sso`: same change, `fetch(config.iam.apiUrl + '/auth/sso/exchange', { code })`.
- `/me`: `isAdmin` becomes `hasPermission(req.session, 'leads.admin.manage')` (or `req.session.isFullAccess`) instead of `req.session.hasAdminAccess`.
- No frontend changes needed — confirmed `SsoCallbackPage.tsx`, `LoginPage.tsx`, `AuthContext.tsx` only consume `{ username, displayName, isAdmin }`, which stays the same shape.

### 2.2 Per-route permission enforcement

This table was already worked out and verified against every route file in this repo's own `leads-integration-instructions.md` §6.3 — it's still accurate, re-use it as-is rather than re-deriving it. Reproduced here for convenience:

**`routes/leads.ts`:** `GET /` → `leads.leads.view` · `GET /export` → `leads.leads.export` · `GET /pipeline` → `leads.leads.view` · `GET /:id` → `leads.leads.view` · `POST /:id/advance-stage` → `leads.leads.update` · `POST /` → `leads.leads.create` · `PUT /:id` → `leads.leads.update` · `DELETE /:id` → `leads.leads.delete` (replaces `requireLeadsTrackerAdmin`)

**`routes/customers.ts`:** `GET /` → `leads.customers.view` · `GET /:id` → `leads.customers.view` · `POST /` → `leads.customers.create` · `PUT /:id` → `leads.customers.update` · `DELETE /:id` → `leads.customers.delete` (replaces `requireLeadsTrackerAdmin`)

**`routes/followups.ts`:** `POST /leads/:id/followups` and `DELETE /followups/:id` → `leads.leads.update` (a follow-up is treated as a lead update, not its own resource — see the original doc if you'd rather gate the delete on `leads.leads.delete` instead, it's a judgment call either way).

**`routes/attachments.ts`:** `GET /leads/:id/attachments` and `GET /attachments/:id/file` → `leads.leads.view` · `POST /leads/:id/attachments` and `DELETE /attachments/:id` → `leads.leads.update`.

**`routes/stats.ts`** (all 4 routes, pure read-only): → `leads.leads.view`.

**`routes/meta.ts`**: leave ungated beyond the router-level `requireAuth` — it's dropdown/reference data only, no record data, and gating it would break the create form for a user who holds `leads.leads.create` without `.view`.

Apply each as `router.get('/path', requirePermission('key'), handler)` (or `router.use(requirePermission('key'))` for a whole router where every route shares one key, same pattern ERP Dashboard uses for its per-section mounts).

## 3. Testing checklist

- [ ] A user with only `leads.leads.view` (no `.create`/`.update`/`.delete`/`.export`) can see the leads list but gets a 403 attempting to create, edit, delete, or export.
- [ ] A user with `leads.leads.delete` but not `leads.customers.delete` can delete a lead but not a customer (or vice versa).
- [ ] `ashish.patel` (Marketing role, currently zero `leads.*` grants) can no longer open/edit leads or customers at all — confirms this fix actually closes the gap that prompted this document. Grant `leads.leads.view` to that role in `syncaxis-iam` and confirm they can then see (but not edit) the leads list.
- [ ] SSO from Portal's "Enquiry Portal"/"Inquiry Portal" tile still lands the user in signed in with no login screen, for a user who holds `portal.leads-tracker.access` (Portal-side tile visibility, unrelated to and unaffected by this change) AND at least one `leads.*` permission (this app's own access gate).
- [ ] Direct URL (no `?ssoCode`) still shows the login form and a real `syncaxis-iam` account can sign in with their existing password.
- [ ] Grant/revoke a `leads.*` permission in `syncaxis-iam` — confirm it's reflected here within 5 minutes (or immediately on next login), same as the existing re-verify cadence.
- [ ] Deactivate a user in `syncaxis-iam` — confirm they're rejected on next login and within 5 minutes if already signed in.

## 4. Rollback

If this needs to be reverted: restore `PORTAL_API_URL` in `.env`, revert `config.ts`/`auth.ts`/`routes/auth.ts` to the `portal`-based versions (git history has the pre-change state), and remove the `requirePermission(...)` calls added in §2.2. The two `DELETE` routes should go back to `requireLeadsTrackerAdmin` to avoid leaving them completely unguarded.

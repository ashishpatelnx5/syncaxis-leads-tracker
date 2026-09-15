# Integrating Leads Tracker with syncaxis-iam — requirements & instructions

**Written for:** a Claude Code session (and developer) working directly inside `F:\Workspace\Syncaxis_Leads_app`. This document is self-contained.

**Hard constraint:** everything here is implemented **inside `Syncaxis_Leads_app` only**. Nothing requires touching `F:\Workspace\syncaxis-iam` or `F:\Workspace\syncaxis-company-portal` — both are reference/read-only from this codebase's point of view.

---

## 1. The two requirements this document satisfies

1. **A user coming from Company Portal should never see a manual login** — SSO must carry them straight in.
2. **A user hitting Leads Tracker's URL directly should authenticate through syncaxis-iam** (not Portal, not a locally-stored password).

Both are satisfied by the **same single change**: Leads Tracker already proxies its own login and SSO handoff to an external identity provider (currently Portal) and keeps its own local session — this is exactly the architecture `syncaxis-iam` expects every consuming app to use. This document is mostly about **retargeting that existing, working pattern from Portal to `syncaxis-iam`**, not building something new.

## 2. Critical dependency — read this before starting

**This migration only works correctly if Company Portal has already been migrated to `syncaxis-iam`** (see `syncaxis-iam`'s own `portal-integration-instructions.md`, run in the Portal repo), or is being migrated in the same change window.

Why: today, when a user clicks the "Leads Tracker" tile in Portal, Portal mints an SSO code **itself**, tracked only in Portal's own in-memory map — that code means nothing to `syncaxis-iam`. If Leads Tracker starts validating SSO codes against `syncaxis-iam` directly (§6) while Portal is still minting its own local codes, **requirement 1 breaks** — Portal's tile click will hand Leads Tracker a code `syncaxis-iam` has never heard of, and the exchange will fail with a 401.

Once Portal is migrated (per its own instructions doc), Portal's `/api/auth/sso/issue` proxies to `syncaxis-iam`'s real `/auth/sso/issue` — meaning the code Portal hands out is a genuine `syncaxis-iam` code, which Leads Tracker can then validate directly against `syncaxis-iam`. **Confirm Portal's migration is live before flipping Leads Tracker over**, or coordinate both changes together.

## 3. What already exists in AuthCenter for Leads Tracker

An app called `leads` is already registered in `syncaxis-iam`'s `AuthCenter` database, with 10 permission keys already declared (verified live against the running service):

```
leads.leads.view
leads.leads.create
leads.leads.update
leads.leads.delete
leads.leads.export
leads.customers.view
leads.customers.create
leads.customers.update
leads.customers.delete
leads.admin.manage
```

These were seeded speculatively when `syncaxis-iam` was designed, based on Leads Tracker's data model — not derived from the actual current codebase. §6.3 below maps them against the real routes (verified by reading the actual route files), and flags the couple of places where they don't line up neatly.

**Not yet registered / not applicable to current code:** nothing for `followups`, `attachments`, `stats`, or `meta` sub-resources — §6.3 recommends folding those into the `leads.leads.*` keys rather than registering new ones, since they're all sub-records of a lead, not independent resources.

## 4. syncaxis-iam API contract (same as Portal's — authoritative, verified against the running service)

**Base URL (local dev):** `http://localhost:8054` — no production URL yet, use an `IAM_API_URL` env var so this is a one-line change later.

**`POST {IAM_API_URL}/auth/login`**
Request: `{ "username": string, "password": string }`
Response `200`: `{ "token": string, "user": UserSummary }`
Errors: `400`, `401`, `423` (locked)

**`UserSummary`:**
```json
{
  "id": 1,
  "username": "mahesh.babar",
  "displayName": "Mahesh Babar",
  "isActive": true,
  "roles": [{ "id": 1, "name": "Admin" }],
  "perms": ["leads.leads.view", "leads.leads.update", "..."],
  "isFullAccess": false,
  "lastLoginAt": "2026-09-15T11:11:28.478Z"
}
```

**`POST {IAM_API_URL}/auth/sso/exchange`** — `{ "code": string }` → `{ "token": string, "user": UserSummary }` (`401` if expired/invalid)

**`GET {IAM_API_URL}/auth/me`** — `Authorization: Bearer <iamToken>` → `{ "user": UserSummary }` (`401` if revoked/deactivated)

**`POST {IAM_API_URL}/auth/logout`** — `Authorization: Bearer <iamToken>` → `204`

No CORS on `syncaxis-iam` — every call above must come from Leads Tracker's backend, never the browser.

## 5. Config changes

`app/server/.env` (and wherever `PORTAL_API_URL` is documented, e.g. `README.md`):
```
IAM_API_URL=http://localhost:8054
```
Remove `PORTAL_API_URL` once the cutover in §6 is complete and confirmed (§8) — keep it temporarily if you want the feature-flag rollback described in §9.

## 6. Backend changes

### 6.1 `app/server/src/auth.ts` — retarget, and widen the session shape

Current `SessionRecord` carries `hasAccess: boolean` / `hasAdminAccess: boolean`, derived by `accessFromPortalUser()` from Portal's `permissions.applications`/`permissions.pages` arrays. Replace with:

```ts
export interface SessionRecord {
  iamToken: string;        // was portalToken
  userId: number;
  username: string;
  displayName: string;
  perms: Set<string>;      // was hasAccess/hasAdminAccess booleans
  isFullAccess: boolean;
  lastVerifiedAt: number;
  expiresAt: number;
}

export function accessFromIamUser(user: any): { perms: Set<string>; isFullAccess: boolean } {
  return { perms: new Set<string>(user?.perms || []), isFullAccess: !!user?.isFullAccess };
}

export function hasPermission(session: SessionRecord, key: string): boolean {
  return session.isFullAccess || session.perms.has(key);
}

// "Can this user open Leads Tracker at all" - the old hasAccess equivalent -
// is now "do they hold any leads.* permission", replacing the old check
// against Portal's 'leads-tracker' application flag.
export function hasAnyLeadsAccess(session: SessionRecord): boolean {
  if (session.isFullAccess) return true;
  for (const p of session.perms) if (p.startsWith('leads.')) return true;
  return false;
}
```

- Rename `reverifyWithPortal` → `reverifyWithIam`, pointed at `IAM_API_URL + '/auth/me'` instead of Portal's `/api/auth/me`. Same 5-minute cadence, same "keep the cached session on a network blip" behavior — none of that logic changes, only the URL and the response-parsing (`accessFromIamUser` instead of `accessFromPortalUser`).
- `requireAuth` stays structurally the same — it's already provider-agnostic (checks the session map, re-verifies on cadence). Just update its call into `reverifyWithIam` and, where it currently gates on `session.hasAccess`, gate on `hasAnyLeadsAccess(session)` instead.
- Add a generic `requirePermission(key: string)` middleware (new — Leads Tracker doesn't have per-action checks today, only the one `requireLeadsTrackerAdmin` gate):
  ```ts
  export function requirePermission(key: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.session || !hasPermission(req.session, key)) {
        return res.status(403).json({ error: 'You do not have access to this.' });
      }
      next();
    };
  }
  ```
- `requireLeadsTrackerAdmin` — keep the function (it's still referenced by name in `leads.ts`/`customers.ts` today), but reconsider what it should actually check. See §6.4 — the two places it's used today are both delete actions, which now have their own dedicated permission keys (`leads.leads.delete`, `leads.customers.delete`); `leads.admin.manage` is arguably a broader "true admin section" concept that doesn't correspond to anything currently gated in this codebase. Read §6.4 before changing this.

### 6.2 `app/server/src/routes/auth.ts` — same URLs, retargeted implementation

- **`POST /login`**: `fetch(IAM_API_URL + '/auth/login', ...)` instead of Portal's URL. On success, build the session with `accessFromIamUser(data.user)` instead of `accessFromPortalUser`, store `iamToken` instead of `portalToken`. `establishSession`'s access check (`if (!hasAccess) return 403 ...`) becomes `if (!hasAnyLeadsAccess(...))`.
- **`POST /sso`**: same change — `fetch(IAM_API_URL + '/auth/sso/exchange', { code })` instead of Portal's `/api/auth/sso/exchange`. This is the endpoint `SsoCallbackPage.tsx` already calls via `loginWithCode` — no frontend change needed (§7).
- **`GET /me`**, **`POST /logout`**: no shape changes needed — `req.session.hasAdminAccess` in the current `GET /me` handler's response should become `req.session.isFullAccess` (or, if the client needs finer-grained info than a single `isAdmin` boolean, consider returning `perms` too — see §7).

### 6.3 New: per-route permission enforcement (the real change here)

Verified by reading every route file directly. Today, `app.ts` mounts every router behind only the blanket `requireAuth` — the only per-route restriction anywhere is `requireLeadsTrackerAdmin` on the two delete routes. Everything else (view, create, update, export) is open to any authenticated user. This section adds the fine-grained checks the permission keys in §3 exist for.

**`app/server/src/routes/leads.ts`:**
| Route | Add |
|---|---|
| `GET /` (list) | `requirePermission('leads.leads.view')` |
| `GET /export` | `requirePermission('leads.leads.export')` |
| `GET /pipeline` | `requirePermission('leads.leads.view')` |
| `GET /:id` | `requirePermission('leads.leads.view')` |
| `POST /:id/advance-stage` | `requirePermission('leads.leads.update')` |
| `POST /` (create) | `requirePermission('leads.leads.create')` |
| `PUT /:id` (update) | `requirePermission('leads.leads.update')` |
| `DELETE /:id` | `requirePermission('leads.leads.delete')` — **replaces** `requireLeadsTrackerAdmin` (§6.4) |

**`app/server/src/routes/customers.ts`:**
| Route | Add |
|---|---|
| `GET /` (list) | `requirePermission('leads.customers.view')` |
| `GET /:id` | `requirePermission('leads.customers.view')` |
| `POST /` (create) | `requirePermission('leads.customers.create')` |
| `PUT /:id` (update) | `requirePermission('leads.customers.update')` |
| `DELETE /:id` | `requirePermission('leads.customers.delete')` — **replaces** `requireLeadsTrackerAdmin` (§6.4) |

**`app/server/src/routes/followups.ts`** (mounted at `/api`, paths are `/leads/:id/followups` and `/followups/:id`):
| Route | Recommended | Note |
|---|---|---|
| `POST /leads/:id/followups` | `requirePermission('leads.leads.update')` | Adding a follow-up modifies the parent lead's status/next-date — treated as a lead update, not a separate resource. |
| `DELETE /followups/:id` | `requirePermission('leads.leads.update')` | Same reasoning. If you'd rather this require the stricter `leads.leads.delete`, that's a defensible alternative — it's a judgment call, pick whichever matches how your team actually wants follow-up deletion gated. |

**`app/server/src/routes/attachments.ts`** (mounted at `/api`, paths `/leads/:id/attachments`, `/attachments/:id/file`, `/attachments/:id`):
| Route | Recommended |
|---|---|
| `GET /leads/:id/attachments` | `requirePermission('leads.leads.view')` |
| `POST /leads/:id/attachments` (upload) | `requirePermission('leads.leads.update')` |
| `GET /attachments/:id/file` (download/stream) | `requirePermission('leads.leads.view')` |
| `DELETE /attachments/:id` | `requirePermission('leads.leads.update')` (same judgment call as followups above) |

**`app/server/src/routes/stats.ts`** (verified — all 4 routes are pure read-only aggregate queries, no writes anywhere in the file):
| Route | Add |
|---|---|
| `GET /` (KPI tiles) | `requirePermission('leads.leads.view')` |
| `GET /dashboard` | `requirePermission('leads.leads.view')` |
| `GET /trend` | `requirePermission('leads.leads.view')` |
| `GET /team-trend` | `requirePermission('leads.leads.view')` |

**`app/server/src/routes/meta.ts`** (verified — one route, `GET /`, returns only dropdown/reference option lists: statuses, priorities, distinct values used to populate filters and the lead/customer forms). **Leave this ungated beyond the router-level `requireAuth`** — it carries no lead/customer record data itself, and gating it on `leads.leads.view` would break the create form for a hypothetical user who holds `leads.leads.create` without `.view`.

### 6.4 What `leads.admin.manage` is for (verified — resolved, not a judgment call)

Checked `app/client/src/App.tsx`, `AdminLeadsPage.tsx`, `AdminCustomersPage.tsx`. Findings:

- `App.tsx` gates the routes client-side: `/admin/leads` and `/admin/customers` render only `if (user?.isAdmin)`, else redirect to `/`.
- Both pages are purely a denser list view with **Edit** and **Delete** actions per row — nothing else. No settings, no config, no functionality beyond what `leads.leads.update`/`.delete` and `leads.customers.update`/`.delete` already cover on the backend.

So `leads.admin.manage` has exactly one job: **it's the gate for whether the Admin section is visible/reachable at all**, not a backend action check. Concretely:

- In `GET /me` (§6.2), compute `isAdmin` as `hasPermission(session, 'leads.admin.manage')` (or `session.isFullAccess`) — this is what the existing `user?.isAdmin` check in `App.tsx` already consumes, unchanged.
- The actual `DELETE` routes stay independently gated by `leads.leads.delete` / `leads.customers.delete` (§6.3) — `requireLeadsTrackerAdmin` can be deleted; nothing else calls it.
- **Edge case worth knowing, not fixing**: a role could hold `leads.admin.manage` without `leads.leads.delete` — they'd reach the Admin page but get a 403 clicking Delete. Not a bug, just something whoever manages roles in `syncaxis-iam`'s permission matrix should grant together in practice.

### 6.5 `app/server/src/config.ts`

Replace `portal.apiUrl` (env: `PORTAL_API_URL`) with `iam.apiUrl` (env: `IAM_API_URL`), same shape otherwise.

## 7. Frontend — verify, don't assume

**No frontend changes needed — fully confirmed, not just assumed.** `AuthContext.tsx`, `SsoCallbackPage.tsx`, `LoginPage.tsx`, `api.ts` only talk to Leads Tracker's *own* backend and consume `{ username, displayName, isAdmin }`, which §6.2/§6.4 preserve exactly. `App.tsx`'s `user?.isAdmin` route gate for `/admin/leads` and `/admin/customers` keeps working unchanged, since `isAdmin` continues to mean the same thing (§6.4).

**One optional UX polish, not required**: `AdminLeadsPage.tsx`/`AdminCustomersPage.tsx` show a Delete button to any admin unconditionally — with the edge case in §6.4 (admin access without delete permission), that button could now 403 on click for such a role. The backend correctly rejects it either way, so this is a nice-to-have (disable/hide the button based on a `perms` list the client doesn't currently receive), not a security gap — leave it unless you want to also extend `GET /me`'s response with the raw `perms` array for this purpose.

## 8. Testing checklist

- [ ] **Requirement 1 — SSO from Portal**: with Portal already migrated (§2), click the Leads Tracker tile from Portal as a real migrated user. Confirm no login screen appears and the user lands signed in.
- [ ] **Requirement 2 — direct URL**: open Leads Tracker's URL directly (no `?ssoCode`), confirm the login form appears and a real `syncaxis-iam` account can sign in with their existing password.
- [ ] A user with only `leads.leads.view` (no `.create`/`.update`/`.delete`/`.export`) can see the leads list but gets a 403 attempting to create, edit, delete, or export.
- [ ] A user with `leads.leads.delete` but not `leads.customers.delete` can delete a lead but not a customer (or vice versa) — confirms the two delete routes are no longer sharing one blanket admin check.
- [ ] Deactivate/revoke a user in `syncaxis-iam`'s admin console — confirm they're rejected on next Leads Tracker login, and within 5 minutes if already signed in.
- [ ] Grant/revoke a `leads.*` permission via `syncaxis-iam`'s permission matrix — confirm it's reflected in Leads Tracker within 5 minutes (or immediately on next login).
- [ ] Attachment download/upload and follow-up add/delete still work for a user holding the permissions §6.3 assigns them.

## 9. Rollback

Keep the old `PORTAL_API_URL`-based code path available behind a feature flag (e.g. `AUTH_SOURCE=iam|portal`) until §8 is confirmed solid, rather than deleting the Portal-pointing code immediately.

## 10. Open questions for whoever executes this

Only two remain — everything else this document originally flagged (`stats.ts`/`meta.ts` gating, what `leads.admin.manage` means) was resolved by reading the actual code, not left as a guess.

1. **Followups/attachments delete**: confirm whether `leads.leads.update` is the right gate for their delete actions (§6.3), or whether they should require the stricter `leads.leads.delete` instead — this is a genuine product/preference decision, not discoverable from the code, since both are reasonable.
2. Confirm Portal's own migration (§2) is live before flipping `IAM_API_URL` over in any shared/production environment — doing this out of order breaks SSO from Portal. `IAM_API_URL` for any non-local environment also isn't set yet — `syncaxis-iam` only has a local address today.

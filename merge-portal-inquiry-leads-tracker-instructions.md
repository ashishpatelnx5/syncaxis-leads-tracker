# Merging `portal.inquiry` and `portal.leads-tracker` into one permission — requirements & instructions

**Written for:** a Claude Code session working directly inside `F:\Workspace\syncaxis-company-portal` (the code change lives there). This document is self-contained — it does not assume you have access to `syncaxis-iam`'s conversation history, only to the three repos named below, all on the same machine: `F:\Workspace\syncaxis-iam`, `F:\Workspace\syncaxis-company-portal`, `F:\Workspace\Syncaxis_Leads_app`.

**Hard constraint:** do not delete `portal.inquiry.access` from `syncaxis-iam`'s database until Portal's renamed app id (§2) is deployed and confirmed working (§4's checklist). Deleting it first would hide the "Enquiry Portal" tile for every current holder of that permission with no code live yet to replace it.

---

## 1. Background — why these two exist and why they look like duplicates

`syncaxis-iam`'s Roles → permission-matrix screen shows two permissions under the `Company Portal` app that look identical (both just an `access` checkbox, no distinguishing description):

- `portal.inquiry.access`
- `portal.leads-tracker.access`

They are **not** actually duplicates today — they gate two different things, verified by reading both codebases directly:

- **`portal.inquiry.access`** controls whether the **"Enquiry Portal" tile is shown on Company Portal's own dashboard**. Verified in `syncaxis-company-portal`:
  - `app/src/data/apps.js` — the tile is registered with `id: 'inquiry'`, `name: 'Enquiry Portal'`, `url: 'http://localhost:8057/'` (i.e. it points at Leads Tracker).
  - `app/src/pages/Home.jsx` / `Applications.jsx` — `apps.filter((app) => hasApp(app.id))`.
  - `app/src/context/AuthContext.jsx` — `hasApp: (key) => user?.isAdmin || permissions.applications.includes(key)`.
  - So an `access` grant on `portal.inquiry` becomes `applications: ['inquiry']` (via the translation in `app/server/src/middleware/auth.js`'s `accessFromIamUser`, `PORTAL_PERM` regex), which is what makes the tile visible.
- **`portal.leads-tracker.access`** is the **actual access check Leads Tracker's own backend performs**. Verified in `Syncaxis_Leads_app/app/server/src/auth.ts`: `accessFromPortalUser()` computes `hasAccess = user?.isAdmin || applications.includes('leads-tracker')`, and `routes/auth.ts`'s `establishSession()` rejects the login/SSO exchange with 403 (`"Sorry! You don't have access to this Portal..."`) if that's false. This is hardcoded as the literal string `'leads-tracker'` and is unrelated to the tile above.

Because Portal's tile happens to be internally named `inquiry` while Leads Tracker's own check expects `leads-tracker`, a role needs **both** permissions granted together today to get the full working experience (see the tile *and* actually get let in). Granting only one produces a broken half-state:
- Only `portal.inquiry.access` → tile visible, clicking it (or a direct URL) gets "Sorry! You don't have access to this Portal."
- Only `portal.leads-tracker.access` → access actually works, but there's no tile/shortcut to find it from Portal's dashboard.

(This document exists because that exact half-broken state was hit in practice: `portal.leads-tracker.access` was mistakenly deleted from `syncaxis-iam` thinking it was a UI duplicate of `portal.inquiry.access`, which silently broke Leads Tracker access for every role that held it. It was restored. This document is the proper, permanent fix instead of a one-off DB patch.)

## 2. The fix — canonicalize on `leads-tracker`, retire `inquiry`

**Decision: `leads-tracker` becomes the one surviving key.** Rationale:
- It's the name Leads Tracker's own backend already hardcodes (`Syncaxis_Leads_app/app/server/src/auth.ts`) — that's the security-relevant side; changing it there would mean editing an access-control check in a different app's backend, which carries more risk than changing a static id in Portal's own frontend data file.
- It's the clearer, more self-describing name for what this permission actually gates, for anyone reading the `syncaxis-iam` permission matrix in the future — `inquiry` alone doesn't tell an admin it's about Leads Tracker access at all, which is exactly how this got merged incorrectly once already.

### 2.1 Code change — `syncaxis-company-portal` (the only code change needed)

In `app/src/data/apps.js`, change the Enquiry Portal tile's `id`:

```diff
   {
-    id: 'inquiry',
+    id: 'leads-tracker',
     name: 'Enquiry Portal',
     description: 'Submit and track inquiries',
     url: import.meta.env.VITE_INQUIRY_URL || 'http://localhost:8057/',
     icon: 'inquiry',
     ssoHandoff: true,
   },
```

Leave `icon: 'inquiry'` as-is — that's an unrelated lookup key into `app/src/components/Icon.jsx`'s icon set, not a permission check. Rename it too only if you want the naming fully consistent; it has no functional effect either way.

**Nothing else in `syncaxis-company-portal` needs to change.** Verified by reading the whole frontend and backend for every reference to `inquiry`/`leads-tracker`:
- `Home.jsx` and `Applications.jsx` already do `hasApp(app.id)` generically — no hardcoded `'inquiry'` string anywhere in either file.
- The backend (`app/server/src`) has **no** reference to `inquiry` or `leads-tracker` at all — it doesn't hardcode the app manifest anywhere; `apps.js` (frontend-only) is the single source of truth for tile ids, and permission checks flow through generically via `hasApp`/`permissions.applications`.
- **Confirmed: Portal's backend does not self-register a permission manifest at startup** (no call to `syncaxis-iam`'s `POST /admin/apps/portal/permissions` anywhere in `app/server`). §6.4 of `portal-integration-instructions.md` described a one-time manual registration call made during the original migration, not something that runs on every boot. This means the `syncaxis-iam` database cleanup in §2.2 below is permanent — `portal.inquiry.access` will not silently reappear after a Portal restart or deploy.

### 2.2 Data change — `syncaxis-iam` (no code change, admin-console/DB only)

Do this **only after** §2.1 is deployed and §4's checklist passes.

1. In `syncaxis-iam`'s admin console (`/admin-ui/roles`), for every role currently holding `portal.inquiry.access`, also grant `portal.leads-tracker.access` if it doesn't already have it (as of this writing, that's the `Marketing` and `Legacy - syncaxis` roles — check the live Roles list rather than trusting this snapshot, roles change over time).
2. Delete the `portal.inquiry.access` permission entirely. There's no delete-a-single-permission UI action in `admin-ui` today — either:
   - Add one (a "Remove" action next to each permission row on the Role: permissions screen, calling through to a new `DELETE`-style route that removes the `Permissions` row, cascading `RolePermissions` — mirrors the existing Role/App delete pattern already in `service/src/admin-ui/views-routes.ts`), or
   - Run a one-off script against the `AuthCenter` database (same pattern as the restore script used to fix the earlier regression): find `PermissionId` for `portal.inquiry.access`, confirm zero roles need it that don't also already hold `portal.leads-tracker.access`, then `DELETE FROM Permissions WHERE [Key] = 'portal.inquiry.access'` (cascades `RolePermissions` automatically per the schema's `ON DELETE CASCADE`).

Either way, **do not** delete `portal.leads-tracker.access` — that's the surviving key.

### 2.3 `Syncaxis_Leads_app` — no changes needed

Confirmed by reading `app/server/src/auth.ts` and `app/server/src/routes/auth.ts` in full: the access check already hardcodes `'leads-tracker'`, which is exactly the key this migration keeps. This file is placed in this repo only for reference/completeness (matching this workspace's existing convention of cross-copying integration docs into every repo they touch or relate to) — there is nothing to implement here.

## 3. Rollback

If something goes wrong after §2.1 is deployed but before §2.2's DB cleanup: no rollback needed, the system is in a superset state (both `inquiry` and `leads-tracker` still exist, tile id now matches `leads-tracker`, so grant `portal.leads-tracker.access` to anyone missing it, exactly as production already does today with both keys granted in parallel).

If §2.2 already ran and something's wrong: re-create `portal.inquiry.access` under the `portal` app and re-grant it to whichever roles need it — same recovery steps used to fix the original regression this document exists to prevent a repeat of.

## 4. Testing checklist

- [ ] Deploy §2.1. Confirm the Enquiry Portal tile still renders on Portal's Home/Applications pages for a user holding `portal.leads-tracker.access` (not `portal.inquiry.access`).
- [ ] Confirm a user holding **only** the old `portal.inquiry.access` (not yet migrated) temporarily loses the tile — expected until §2.2's grant-both step runs; don't skip §2.2 step 1.
- [ ] After §2.2 step 1 (grant `leads-tracker` to every current `inquiry` holder): confirm the tile is visible again for those roles.
- [ ] Click the tile end-to-end — SSO handoff into Leads Tracker succeeds, no "Sorry! You don't have access" error.
- [ ] Open Leads Tracker's URL directly (no `?ssoCode`) and log in with a `portal.leads-tracker.access`-holding account — succeeds.
- [ ] After §2.2 step 2 (delete `portal.inquiry.access`): confirm the Roles permission matrix in `syncaxis-iam` now shows a single `portal.leads-tracker` row instead of two, and the tile/access behavior above still both work.
- [ ] Spot-check a role that should **not** have Leads Tracker access at all (neither key) — tile absent, direct login still rejected.

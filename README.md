# Attendance Register

A phone-first attendance register for laborers working across multiple sites, with two kinds of users:

- **Owner** (you) — sees everything: headcount, workers, sites, wages and reports.
- **Supervisor** — marks attendance and enters **bata** (site cash) from their own phone. They never see
  rates, wages, or other supervisors' data (enforced in the database with Row Level Security).

No app to install — it's just a website; add it to the home screen if you like.

## Features
- Supervisors mark **Full / Half / Absent** for any worker at any site (including themselves).
- One entry per worker per day: once marked, a worker leaves the "to mark" list and can't be
  re-tagged at another site. The day's entries show **who marked them**; only that person can undo
  their own entry. Supervisors never mark each other.
- Supervisors can **add a worker** (name + role only) when someone new shows up on site; the owner is
  prompted to set that worker's rate, and the worker shows **who added them**.
- Day-rate **and** month-rate workers; rates per work type (role) with per-worker overrides.
- **Bata**: owner hands cash to a supervisor; the supervisor records the breakdown (lunch, travel/tempo,
  material, other) and the owner sees it in reports as a separate "misc" line.
- **Reports**: live current week, a week list with tap-to-view summaries, and a monthly view that
  includes monthly-salaried workers. Advances / deductions / bonuses are editable from a list.
- Owner home shows a read-only per-site headcount for the day with the marker's name.
- Live sync across all phones via Supabase Realtime.

Stack: React + Vite + TypeScript + Tailwind, Supabase (Postgres + Auth + RLS + Realtime + Edge Functions),
deployed to GitHub Pages.

---

## How access works
1. The **owner** account is created up front (see setup below).
2. Each **supervisor** has an unclaimed profile. On the login screen they tap their name → **Request access**.
3. The owner opens **More → Supervisors & access** and taps **Approve**.
4. The supervisor returns to the login screen, taps their name → **Create my login** and chooses a PIN.

PINs are short (people type 4 digits). Supabase requires passwords of at least 6 characters, so short PINs
are left-padded with zeros (`2711` → `002711`); this is handled by the app and the `enroll` Edge Function.

---

## One-time setup

### 1. Create the Supabase project
Create a free project at <https://supabase.com> and wait for provisioning.

### 2. Create the schema
Apply the schema SQL in the Supabase **SQL Editor** (tables, RLS policies, and the report/helper
functions). The schema includes: `locations`, `roles`, `workers`, `attendance`, `advances`,
`pay_overrides`, `profiles`, `bata_grants`, `bata_expenses`, the RLS policies and the report/helper
functions. (`supabase/schema.sql` is the original v1 reference; the v2 objects were applied as
migrations.)

### 3. Create the owner login
Create the owner auth user (via the dashboard or SQL). Note the account's `user_id`, then add a row in
`profiles`:
```sql
insert into public.profiles (user_id, display_name, role, login_email, status, approved_at)
values ('<owner-user-id>', 'Owner', 'owner', 'family@gail-attendance.app', 'active', now());
```

### 4. Create unclaimed supervisor profiles
```sql
insert into public.profiles (display_name, role, login_email, worker_id, status)
values
  ('Avijit', 'supervisor', 'avijit@gail-attendance.app',
   (select id from workers where name = 'Avijit'), 'unclaimed'),
  ('Hanumantha', 'supervisor', 'hanumantha@gail-attendance.app',
   (select id from workers where name = 'Hanumantha'), 'unclaimed');
```

### 5. Deploy the `enroll` Edge Function
The function lives in `supabase/functions/enroll/index.ts`. It creates the supervisor's auth user on
first login. Deploy it with `verify_jwt = false` (it is called before the user has a session). The
Supabase runtime provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically.

### 6. Configure the app environment
Copy `.env.example` to `.env.local` and fill in:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 7. Run it locally
```bash
npm install
npm run dev
```

---

## Deploying (GitHub Pages)
Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds with `VITE_BASE` set to the repo
name and publishes to GitHub Pages. Set the repository variables `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (Settings → Secrets and variables → Actions → Variables).

---

## How pay is calculated

| Setting | Rule |
|---|---|
| Worker rate basis = **Per day** | Full = day rate; Half = 50%; Absent = 0 |
| Worker rate basis = **Per month** | Paid via the monthly report (daily entries don't accrue day pay) |
| Per-worker override | Used instead of the role rate when set |

Advances, deductions and bonuses are entered per worker and applied in the report. Bata is tracked
separately and shown as a "misc" line.

## Data model
Table | Purpose
---|---
`locations` | Sites
`roles` | Work types with day and month base rates
`workers` | People, their role, rate basis and overrides
`attendance` | One row per worker per day (status, hours, marked_by)
`advances` | Advances / deductions / bonuses
`pay_overrides` | Per-worker-per-day pay overrides
`profiles` | Owner and supervisor accounts
`bata_grants` | Cash given to a supervisor
`bata_expenses` | What a supervisor spent

Report functions: `report_range(from,to,include_monthly)`, `report_by_location(from,to)`,
`report_bata(from,to)`. Access helpers: `login_directory()`, `request_access`, `approve_access`,
`reject_access`, `public_workers()`, `is_owner()`, `current_profile_id()`.

## Security notes
- Row Level Security is on for every table. Supervisors can read locations and attendance and write
  attendance, and can only see their own profile, bata grants and bata expenses. Workers, roles, wages
  and advances are owner-only.
- The `enroll` Edge Function only claims a profile that is already **approved** and not yet linked.
- The anon key in the frontend is public by design; the PIN login is what protects the data.
- Recommendation: enable **Leaked password protection** in the Supabase Auth settings.

## Project scripts
```bash
npm run dev        # local dev server
npm run build      # type-check + production build to dist/
npm run preview    # preview the production build
npm run typecheck  # TypeScript only
```

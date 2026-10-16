# Attendance Register

A phone-first attendance register for laborers working across multiple sites.
One link, one shared PIN, and everyone (you, your dad, your mom) stays in sync.
No app to install — it's just a website; add it to the home screen if you like.

- Mark who worked, **where**, and for **how long**
- Day-rate or hour-rate workers, different rate per work type (role)
- Edit the pay for any single day (partial days, early leave)
- **Advances / deductions / bonuses** per worker
- **Weekly (Mon–Sun) and monthly reports**: gross wages, advances, net payable
- Cost by site, and CSV export
- Live sync across all phones via Supabase Realtime

Stack: React + Vite + TypeScript + Tailwind, Supabase (Postgres + Auth + RLS + Realtime).

---

## One-time setup

### 1. Create the Supabase project
1. Go to <https://supabase.com> and create a free project.
2. Wait for it to finish provisioning.

### 2. Create the database
1. In Supabase, open **SQL Editor → New query**.
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and **Run**.
3. (Optional) Paste [`supabase/seed.sql`](supabase/seed.sql) and Run to add example roles/sites.

### 3. Create the shared login (this is your PIN)
1. Open **Authentication → Users → Add user → Create new user**.
2. Email: e.g. `family@yourhome.app` (any address you'll remember — no emails are sent).
3. Password: your family **PIN** (at least 6 characters).
4. Leave "Auto confirm user" on (or confirm it manually).

> Everyone shares this one login. The PIN protects the data; the link alone shows nothing.

### 4. Configure the app environment
1. In Supabase: **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
2. Copy `.env.example` to `.env.local` and fill in:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   VITE_AUTH_EMAIL=family@yourhome.app
   ```

### 5. Run it locally
```bash
npm install
npm run dev
```
Open the printed URL on your phone (same Wi-Fi) or desktop, enter the PIN, and start.

---

## Deploying (get your shareable link)

### Option A — Vercel
1. Push this folder to a GitHub repo.
2. On <https://vercel.com>, **New Project → Import** the repo.
3. Add the three environment variables from step 4.
4. Deploy. Share the resulting `https://your-app.vercel.app` link.

### Option B — Netlify
1. Push to GitHub, then **Add new site → Import an existing project**.
2. Build command `npm run build`, publish directory `dist`.
3. Add the three environment variables. Deploy.

### Option C — Cloudflare Pages
Build command `npm run build`, output directory `dist`, add the same env vars.

After deploy, open the link on each phone → **Share → Add to Home Screen** for an app-like icon.

---

## How pay is calculated

| Setting | Rule |
|---|---|
| Worker rate basis = **Per day** | Full = role/day rate; Half = 50% |
| Worker rate basis = **Per hour** | Hours × hour rate |
| Per-worker override | Used instead of the role rate when set |

Every entry is pre-filled from these rules but **you can edit the amount for any single day** (it's
marked "edited"). Advances and deductions are entered per worker and subtracted in the report.

## Data model
`locations`, `roles`, `workers`, `attendance` (one row per worker per day), `advances`.
Two SQL functions power the reports: `report_range(from,to)` and `report_by_location(from,to)`.

## Security notes
- Row Level Security is on for every table; only the signed-in shared account can read/write.
- Anyone with the link **and** the PIN can edit everything. Keep the PIN within the family.
- The anon key in the frontend is public by design; the PIN/login is what protects the data.

## Changing the PIN
Supabase → **Authentication → Users →** select the user → **Reset password** (or update it).
No app change or redeploy needed.

## Project scripts
```bash
npm run dev        # local dev server
npm run build      # type-check + production build to dist/
npm run preview    # preview the production build
npm run typecheck  # TypeScript only
```

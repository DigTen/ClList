# Pilates Payments SPA

React + TypeScript + Vite single-page app for tracking monthly client payments and summary metrics.

## Stack

- React + TypeScript + Vite
- Supabase Auth (email/password) + Postgres
- TanStack Query for client-side data caching
- Hash-based routing (`HashRouter`) for GitHub Pages compatibility

## Features

- Email/password sign up, sign in, sign out
- Protected routes (`/#/payments`, `/#/summary`)
- Clients list with `Add client` modal
- Monthly payments grid:
  - active clients left-joined with that month payment rows
  - inline editable `lessons`, `price`, `paid`, `notes`
  - upsert on edit (`user_id + client_id + month_start`)
- Summary page:
  - lessons + paid status by client
  - aggregate totals: lessons, revenue, paid/unpaid counts

## Project Structure

```text
src/
  auth/AuthProvider.tsx
  components/
    AddClientDialog.tsx
    MonthPicker.tsx
    NavBar.tsx
    PaymentsGrid.tsx
  lib/
    data.ts
    date.ts
    supabaseClient.ts
  pages/
    Login.tsx
    Payments.tsx
    Signup.tsx
    Summary.tsx
  routes/
    ProtectedRoute.tsx
    PublicOnlyRoute.tsx
sql/
  schema.sql
.github/workflows/
  deploy-pages.yml
```

## Supabase Setup

1. Create a Supabase project.
2. In Supabase SQL Editor, run `sql/schema.sql`.
3. In Supabase dashboard:
   - `Authentication -> Providers -> Email`: enable Email provider.
   - `Authentication -> URL Configuration`:
     - `Site URL`:
       - local dev: `http://localhost:5173`
       - production: `https://<github-username>.github.io/<repo-name>/`
     - `Additional Redirect URLs`:
       - `http://localhost:5173`
       - `http://localhost:5173/#/login`
       - `https://<github-username>.github.io/<repo-name>/`
       - `https://<github-username>.github.io/<repo-name>/#/login`
4. Copy `Project URL` and `anon public key` from Supabase project settings.

## Environment Variables

Copy `.env.example` to `.env`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/#/login`.

## GitHub Pages Deploy

Workflow file: `.github/workflows/deploy-pages.yml`

1. Push to `main`.
2. In GitHub repo settings:
   - `Pages -> Source`: set to `GitHub Actions`.
3. The action builds Vite and deploys `dist/` to Pages.

## Notes

- Vite `base` is set to `./` in `vite.config.ts` to support repo-based GitHub Pages paths.
- Routing uses `HashRouter` to avoid 404 on refresh/deep links in static hosting.
- RLS restricts all `clients` and `payments` access to `auth.uid() = user_id`.


# AutoCare Backend + Supabase Setup

## 1. Create environment file

Copy `.env.example` to `.env` and replace `YOUR_PASSWORD` with your Supabase database password.

Do not add `.env` to Git.

## 2. Install dependencies

```bash
npm install
```

## 3. Create database tables

Run the SQL files against Supabase using the direct database URL:

```bash
npm run db:schema
npm run db:seed
```

The seed creates:

- Admin: `admin@autocare.lk` / `admin123`
- Customer: `customer@autocare.lk` / `customer123`

## 4. Start the system

```bash
npm start
```

Open:

- Login: `http://localhost:3000/login.html`
- Admin dashboard: `http://localhost:3000/admin-dashboard.html`
- Customer dashboard: `http://localhost:3000/customer-dashboard.html`

## Security Note

Supabase PostgreSQL URLs are used only by `server.js`. The browser talks to `/api/...` routes and never receives the database password.

# Campus One

A small web app for a campus super-app demo: canteen pre-order with QR pickup, announcements, a simulated bus tracker, and student status. Built with plain HTML/CSS/JS on the frontend and Express + SQLite on the backend — no build step.

## Setup

Clone the repository and enter the project folder:

```bash
git clone https://github.com/Siddharthcu/CAMPUS_ONE.git
cd CAMPUS_ONE
```

Install dependencies:

```bash
npm install
```

Create your local `.env` (it is intentionally not committed):

```bash
cp .env.example .env
```

Generate two different random secrets and put them in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs login tokens |
| `QR_SECRET` | Signs pickup QR tokens (keep different from `JWT_SECRET`) |
| `PORT` | Server port, default `3000` |
| `CORS_ORIGIN` | `false` (same-origin only) or an allowed origin for a separate frontend |

Start the server:

```bash
npm start
```

Open <http://localhost:3000>.

## Demo login credentials

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@college.edu` | `password123` |
| Staff | `staff@college.edu` | `password123` |
| Admin | `admin@college.edu` | `password123` |

Payment is a simulation — no real money is processed. New accounts can self-register as students with a `@college.edu` email.

## Features

- **Canteen:** category tabs, cart, stock limits, staff menu management, mock UPI payment, and a signed single-use pickup QR. Unpaid orders release their reserved stock after 15 minutes; paid pickup codes expire after 40 minutes.
- **Pickup scanner:** staff/admin can scan (or manually paste) a QR token, see the student and items, and redeem it once. Replays and expired codes are rejected.
- **Announcements:** read-only for students; staff/admin can post.
- **Bus tracking:** simulated live positions, delays, per-stop scheduled/live times and ETAs (placeholder for a real GPS feed).
- **Student status:** attendance, fee status, and library books due.

## Project layout

```
public/                 Plain HTML/CSS/JS frontend
  shared/auth.js        Token storage, API wrapper, login guard
  canteen/              Menu, checkout/QR, staff scanner, menu manager
  announcements/        Announcement list + posting form
  bus/, student/        Feature pages
server/
  index.js              Express app, static files, error handling
  db.js                 SQLite schema, one-time migrations, demo seed data
  middleware/           Auth, role checks, simple rate limiter
  routes/               One router per feature
kahe.sqlite*            Local demo database (not committed)
```

## Notes

- The SQLite database and `.env` are gitignored. A fresh database is seeded automatically on first start.
- Migrations run once and are tracked in the `app_meta` table, so staff edits to menu items are not overwritten on restart.
- This is a college demo, not production-ready: tokens are not revocable after logout, the rate limiter is in-memory, and bus data is simulated.

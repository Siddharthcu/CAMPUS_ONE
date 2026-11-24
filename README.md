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

Start the server:

```bash
npm start
```

On first run the server automatically creates a private `.env` with fresh random secrets (and seeds `kahe.sqlite`). Nothing else to configure — this works on any new machine. `.env` and the database are gitignored, so each clone gets its own keys and data.

If you want to set the values yourself instead, copy `.env.example` to `.env` before starting; the server will use your file and leave it alone.

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs login tokens |
| `QR_SECRET` | Signs pickup QR tokens (keep different from `JWT_SECRET`) |
| `PORT` | Server port, default `3000` |
| `CORS_ORIGIN` | `false` (same-origin only) or an allowed origin for a separate frontend |

Open <http://localhost:3000>.

## Demo login credentials

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@college.edu` | `password123` |
| Staff | `staff@college.edu` | `password123` |
| Admin | `admin@college.edu` | `password123` |

Payment is a simulation — no real money is processed. New accounts can self-register as students with a `@college.edu` email.

## Features

- **Canteen:** category tabs, a cart that survives page navigation, stock limits, staff menu management, mock UPI payment, and a signed single-use pickup QR. Unpaid orders release their reserved stock after 15 minutes; paid pickup codes expire after 40 minutes.
- **My Orders:** students can review all their past orders, see item details and statuses, open a paid order's QR again, and cancel an order before pickup (cancelling returns the reserved stock and invalidates the QR). Staff see cancelled orders with their status in the live queue.
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

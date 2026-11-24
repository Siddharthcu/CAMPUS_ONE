require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Fail fast instead of serving broken auth/QR tokens if config is missing.
for (const name of ['JWT_SECRET', 'QR_SECRET']) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}. See .env.example.`);
    process.exit(1);
  }
}

const authRoutes = require('./routes/auth');
const canteenRoutes = require('./routes/canteen');
const announcementRoutes = require('./routes/announcements');
const busRoutes = require('./routes/bus');
const studentRoutes = require('./routes/student');

const app = express();

// Same-origin by default. Set CORS_ORIGIN to allow a separate frontend.
app.use(cors({ origin: process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== 'false'
  ? process.env.CORS_ORIGIN
  : false }));
app.use(express.json({ limit: '32kb' }));

// API routes - one module per feature, all sharing the same auth
app.use('/api/auth', authRoutes);
app.use('/api/canteen', canteenRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/bus', busRoutes);
app.use('/api/student', studentRoutes);

// Basic health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Static frontend (plain HTML/CSS/JS)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Unknown API paths get JSON, not the SPA shell.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Express 4 does not catch rejected async handlers automatically.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Campus One server running on http://localhost:${PORT}`);
  console.log('Demo logins:');
  console.log('  Student: student@college.edu / password123');
  console.log('  Staff:   staff@college.edu / password123');
  console.log('  Admin:   admin@college.edu / password123');
});

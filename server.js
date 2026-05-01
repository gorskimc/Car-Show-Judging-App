const path = require('path');
const express = require('express');
const session = require('express-session');
require('dotenv').config();

const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Hard-fail at boot if security-critical env vars are missing.
for (const key of ['SESSION_SECRET', 'EVENT_PASSWORD']) {
  if (!process.env[key]) {
    console.error(`FATAL: ${key} is not set in .env. Refusing to start.`);
    process.exit(1);
  }
}

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // secure cookies require HTTPS — fine to disable on local http://
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000, // 12 hours
    },
  }),
);

// API routes
app.use('/api/auth', authRoutes);

// Static PWA shell
app.use(express.static(path.join(__dirname, 'public')));

// Liveness check.
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Car Show Judging App listening on http://localhost:${PORT}`);
});

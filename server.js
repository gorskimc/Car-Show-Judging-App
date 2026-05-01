const os = require('os');
const path = require('path');
const express = require('express');
const session = require('express-session');
require('dotenv').config();

// Find the first non-loopback IPv4 address so we can print a URL that
// other devices on the same Wi-Fi (a phone, say) can actually use.
function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const authRoutes = require('./routes/auth');
const registrationsRoutes = require('./routes/registrations');

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
app.use('/api/registrations', registrationsRoutes);

// Static PWA shell
app.use(express.static(path.join(__dirname, 'public')));

// Liveness check.
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  const lanIp = getLanIp();
  console.log('Car Show Judging App listening on:');
  console.log(`  http://localhost:${PORT}    (this Mac)`);
  if (lanIp) {
    console.log(`  http://${lanIp}:${PORT}    (other devices on this Wi-Fi)`);
  }
});

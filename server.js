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
const rubricRoutes = require('./routes/rubric');
const sessionsRoutes = require('./routes/sessions');
const photosRoutes = require('./routes/photos');

const app = express();
const PORT = process.env.PORT || 3000;

// Hard-fail at boot if security-critical env vars are missing.
for (const key of ['SESSION_SECRET', 'EVENT_PASSWORD']) {
  if (!process.env[key]) {
    console.error(`FATAL: ${key} is not set in .env. Refusing to start.`);
    process.exit(1);
  }
}

// Loud warning if TEST_MODE is on — easy to spot in server logs.
const TEST_MODE = ['true', '1', 'yes'].includes(
  (process.env.TEST_MODE || '').toLowerCase(),
);
if (TEST_MODE) {
  console.warn('');
  console.warn('⚠️  TEST_MODE is ON — checked-in requirement is bypassed.');
  console.warn('   Set TEST_MODE=FALSE in .env and restart before real judging.');
  console.warn('');
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
app.use('/api/rubric', rubricRoutes);
app.use('/api/sessions', sessionsRoutes);
// photos has both /api/sessions/.../photos (upload, scoped) and /api/photos/:id (delete, flat)
app.use('/api', photosRoutes);

// Public static serve for uploaded photos. Filenames are random UUIDs, so
// URLs are unguessable; we deliberately don't gate this with auth.
// The on-disk location is configurable via the UPLOAD_DIR env var so the
// production server can point at any directory (absolute or relative).
const uploadDirEnv = process.env.UPLOAD_DIR || 'uploads';
const uploadDir = path.isAbsolute(uploadDirEnv)
  ? uploadDirEnv
  : path.join(__dirname, uploadDirEnv);
app.use('/uploads', express.static(uploadDir));

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

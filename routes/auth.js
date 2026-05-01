const express = require('express');
const { judgingPool } = require('../db/connection');

const router = express.Router();

// Title-case across word boundaries: "MARC O'BRIEN" -> "Marc O'Brien".
// \b matches transitions to/from word chars, so spaces, apostrophes, and
// hyphens all trigger capitalization.
function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

// POST /api/auth/login
// Body: { firstname, lastname, password }
// Validates the shared event password, normalizes the name, finds-or-creates
// the judges row, and stores judge_id in the session.
router.post('/login', async (req, res) => {
  const { firstname, lastname, password } = req.body || {};

  if (!firstname || !lastname || !password) {
    return res
      .status(400)
      .json({ error: 'firstname, lastname, and password are required' });
  }

  if (password !== process.env.EVENT_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const cleanFirst = titleCase(String(firstname).trim());
  const cleanLast = titleCase(String(lastname).trim());

  if (!cleanFirst || !cleanLast) {
    return res
      .status(400)
      .json({ error: 'firstname and lastname must be non-empty' });
  }

  const existing = await judgingPool.query(
    'SELECT id, is_active FROM judges WHERE firstname = $1 AND lastname = $2',
    [cleanFirst, cleanLast],
  );

  let judgeId;
  if (existing.rows.length > 0) {
    if (!existing.rows[0].is_active) {
      return res
        .status(403)
        .json({ error: 'This account has been disabled. Contact the organizer.' });
    }
    judgeId = existing.rows[0].id;
    await judgingPool.query(
      'UPDATE judges SET last_login_at = NOW() WHERE id = $1',
      [judgeId],
    );
  } else {
    const inserted = await judgingPool.query(
      'INSERT INTO judges (firstname, lastname, last_login_at) VALUES ($1, $2, NOW()) RETURNING id',
      [cleanFirst, cleanLast],
    );
    judgeId = inserted.rows[0].id;
  }

  req.session.judgeId = judgeId;
  req.session.firstname = cleanFirst;
  req.session.lastname = cleanLast;

  res.json({ id: judgeId, firstname: cleanFirst, lastname: cleanLast });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me
// Returns the currently logged-in judge, or 401 if no session.
router.get('/me', (req, res) => {
  if (!req.session?.judgeId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json({
    id: req.session.judgeId,
    firstname: req.session.firstname,
    lastname: req.session.lastname,
  });
});

module.exports = router;

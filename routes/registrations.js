const express = require('express');
const { customersPool } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Test-mode toggle: when truthy, the checked-in filter is dropped so a
// tester can judge any paid car without the database being touched.
const TEST_MODE = ['true', '1', 'yes'].includes(
  (process.env.TEST_MODE || '').toLowerCase(),
);

// GET /api/registrations/:participant
// Looks up a paid + checked-in car in the partner's corvetteisland database.
// We deliberately collapse "not found" / "unpaid" / "not checked in" into a
// single 404 so the judge UI doesn't reveal payment / check-in state.
router.get('/:participant', requireAuth, async (req, res) => {
  const participant = Number(req.params.participant);

  if (!Number.isInteger(participant) || participant <= 0) {
    return res.status(400).json({ error: 'Invalid registration number' });
  }

  const result = await customersPool.query(
    `SELECT participant, firstname, lastname, year, make, model, bodytype, color, generation
       FROM public.customers
      WHERE participant = $1
        AND paid = true
        AND (checkedin = true OR $2 = true)`,
    [participant, TEST_MODE],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(result.rows[0]);
});

module.exports = router;

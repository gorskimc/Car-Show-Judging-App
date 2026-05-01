const express = require('express');
const { judgingPool, customersPool } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Helper: fetch a session row + its deductions (all 71 once seeded).
async function loadSession(sessionId) {
  const [sessionRes, deductionsRes] = await Promise.all([
    judgingPool.query('SELECT * FROM judging_sessions WHERE id = $1', [sessionId]),
    judgingPool.query(
      'SELECT * FROM deductions WHERE judging_session_id = $1 ORDER BY rubric_item_id',
      [sessionId],
    ),
  ]);
  return {
    session: sessionRes.rows[0],
    deductions: deductionsRes.rows,
  };
}

// POST /api/sessions
// Body: { participant }
// "Start Judging" — creates a fresh session + 71 deduction rows in one
// transaction, OR resumes the judge's existing session for this car.
router.post('/', requireAuth, async (req, res) => {
  const judgeId = req.session.judgeId;
  const participant = Number(req.body?.participant);

  if (!Number.isInteger(participant) || participant <= 0) {
    return res.status(400).json({ error: 'Invalid participant' });
  }

  // Validate the car is paid + checked in (corvetteisland).
  const cust = await customersPool.query(
    `SELECT participant FROM public.customers
      WHERE participant = $1 AND paid = true AND checkedin = true`,
    [participant],
  );
  if (cust.rows.length === 0) {
    return res.status(404).json({ error: 'Car not found or not eligible' });
  }

  // Find the active show.
  const showRes = await judgingPool.query(
    'SELECT id FROM shows WHERE is_active = true LIMIT 1',
  );
  if (showRes.rows.length === 0) {
    return res.status(404).json({ error: 'No active show' });
  }
  const showId = showRes.rows[0].id;

  // Existing session for this show + car?
  const existing = await judgingPool.query(
    'SELECT id, judge_id, is_complete FROM judging_sessions WHERE show_id = $1 AND participant = $2',
    [showId, participant],
  );
  if (existing.rows.length > 0) {
    const s = existing.rows[0];
    if (s.is_complete) {
      return res
        .status(409)
        .json({ error: 'This car has already been fully judged.' });
    }
    if (s.judge_id !== judgeId) {
      return res
        .status(409)
        .json({ error: 'This car is being judged by another judge.' });
    }
    // Resume.
    return res.json(await loadSession(s.id));
  }

  // New session — INSERT session + INSERT 71 deduction rows in one TX.
  const client = await judgingPool.connect();
  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO judging_sessions (show_id, judge_id, participant)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [showId, judgeId, participant],
    );
    const sessionId = inserted.rows[0].id;

    // Pre-create one deduction row per rubric item, with frozen snapshots
    // and per-mode default deduction_amount:
    //   deduct mode -> 0     (start at perfect, judge subtracts)
    //   award  mode -> max   (start at no bonus, judge subtracts to award)
    await client.query(
      `INSERT INTO deductions (
         judging_session_id, rubric_item_id, deduction_amount,
         frozen_item_name, frozen_max_points,
         frozen_subsection_name, frozen_section_name
       )
       SELECT
         $1,
         i.id,
         CASE WHEN sec.scoring_mode = 'award' THEN i.max_points ELSE 0 END,
         i.name,
         i.max_points,
         sub.name,
         sec.name
       FROM rubric_items i
       JOIN rubric_subsections sub ON sub.id = i.subsection_id
       JOIN rubric_sections sec    ON sec.id = sub.section_id
       WHERE sec.show_id = $2`,
      [sessionId, showId],
    );

    await client.query('COMMIT');
    return res.json(await loadSession(sessionId));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/sessions/:sessionId
// Returns the session + its 71 deduction rows, gated to the current judge.
// Used by the judging page to bootstrap walkthrough state from a URL param.
router.get('/:sessionId', requireAuth, async (req, res) => {
  const judgeId = req.session.judgeId;
  const sessionId = Number(req.params.sessionId);

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid session id' });
  }

  const sessionRow = await judgingPool.query(
    'SELECT id, judge_id FROM judging_sessions WHERE id = $1',
    [sessionId],
  );
  if (sessionRow.rows.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (sessionRow.rows[0].judge_id !== judgeId) {
    return res.status(403).json({ error: 'Session belongs to another judge' });
  }

  return res.json(await loadSession(sessionId));
});

// PATCH /api/sessions/:sessionId/items/:rubricItemId
// Body: { deduction_amount?, notes? }
// Save-as-you-go endpoint. Fired when the judge moves to the next item.
router.patch('/:sessionId/items/:rubricItemId', requireAuth, async (req, res) => {
  const judgeId = req.session.judgeId;
  const sessionId = Number(req.params.sessionId);
  const rubricItemId = Number(req.params.rubricItemId);
  const { deduction_amount, notes } = req.body || {};

  if (!Number.isInteger(sessionId) || !Number.isInteger(rubricItemId)) {
    return res.status(400).json({ error: 'Invalid session or item id' });
  }

  // Verify ownership and not-yet-submitted.
  const sessionRow = await judgingPool.query(
    'SELECT id, judge_id, is_complete FROM judging_sessions WHERE id = $1',
    [sessionId],
  );
  if (sessionRow.rows.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (sessionRow.rows[0].judge_id !== judgeId) {
    return res.status(403).json({ error: 'Session belongs to another judge' });
  }
  if (sessionRow.rows[0].is_complete) {
    return res
      .status(409)
      .json({ error: 'Session is submitted — cannot edit further' });
  }

  try {
    const result = await judgingPool.query(
      `UPDATE deductions
          SET deduction_amount = COALESCE($1, deduction_amount),
              notes = COALESCE($2, notes),
              updated_at = NOW()
        WHERE judging_session_id = $3 AND rubric_item_id = $4
        RETURNING *`,
      [deduction_amount, notes, sessionId, rubricItemId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deduction row not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    // Postgres CHECK violations come back as code '23514'.
    if (err.code === '23514') {
      return res.status(400).json({
        error:
          'Invalid deduction_amount: must be 0 ≤ value ≤ max and a clean ¼-point increment.',
      });
    }
    throw err;
  }
});

module.exports = router;

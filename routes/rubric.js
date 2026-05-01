const express = require('express');
const { judgingPool } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/rubric
// Returns the ACTIVE show's rubric as a nested structure:
//   { show, sections: [ { ..., subsections: [ { ..., items: [...] } ] } ] }
router.get('/', requireAuth, async (req, res) => {
  const showResult = await judgingPool.query(
    'SELECT id, name, year FROM shows WHERE is_active = true LIMIT 1',
  );

  if (showResult.rows.length === 0) {
    return res.status(404).json({ error: 'No active show' });
  }

  const show = showResult.rows[0];

  const [sectionsResult, subsectionsResult, itemsResult] = await Promise.all([
    judgingPool.query(
      `SELECT id, name, description, display_order, max_points, scoring_mode
         FROM rubric_sections
        WHERE show_id = $1
        ORDER BY display_order`,
      [show.id],
    ),
    judgingPool.query(
      `SELECT s.id, s.section_id, s.name, s.description, s.display_order
         FROM rubric_subsections s
         JOIN rubric_sections sec ON sec.id = s.section_id
        WHERE sec.show_id = $1
        ORDER BY s.display_order`,
      [show.id],
    ),
    judgingPool.query(
      `SELECT i.id, i.subsection_id, i.name, i.display_order, i.max_points, i.notes
         FROM rubric_items i
         JOIN rubric_subsections sub ON sub.id = i.subsection_id
         JOIN rubric_sections sec ON sec.id = sub.section_id
        WHERE sec.show_id = $1
        ORDER BY i.display_order`,
      [show.id],
    ),
  ]);

  // Nest subsections under sections, items under subsections.
  const subsByParent = new Map();
  for (const sub of subsectionsResult.rows) {
    if (!subsByParent.has(sub.section_id)) {
      subsByParent.set(sub.section_id, []);
    }
    subsByParent.get(sub.section_id).push({
      id: sub.id,
      name: sub.name,
      description: sub.description,
      display_order: sub.display_order,
      items: [],
    });
  }

  const subById = new Map();
  for (const arr of subsByParent.values()) {
    for (const sub of arr) subById.set(sub.id, sub);
  }

  for (const item of itemsResult.rows) {
    const sub = subById.get(item.subsection_id);
    if (sub) sub.items.push(item);
  }

  res.json({
    show: { id: show.id, name: show.name, year: show.year },
    sections: sectionsResult.rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      display_order: s.display_order,
      max_points: s.max_points,
      scoring_mode: s.scoring_mode,
      subsections: subsByParent.get(s.id) || [],
    })),
  });
});

module.exports = router;

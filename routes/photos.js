const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { judgingPool } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// On-disk location is configurable via UPLOAD_DIR (absolute or relative to
// project root). Defaults to ./uploads if unset.
const uploadDirEnv = process.env.UPLOAD_DIR || 'uploads';
const UPLOAD_DIR = path.isAbsolute(uploadDirEnv)
  ? uploadDirEnv
  : path.join(__dirname, '..', uploadDirEnv);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Random UUID filenames keep paths unguessable so we can serve uploads
// publicly without exposing customer data through filename enumeration.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// Helper: best-effort filesystem cleanup (used when we abort an upload that
// already wrote bytes to disk).
async function unlinkSafe(filepath) {
  try {
    await fs.promises.unlink(filepath);
  } catch (err) {
    /* ignore */
  }
}

// POST /api/sessions/:sessionId/items/:rubricItemId/photos
// Multipart upload — field name "photo".
router.post(
  '/sessions/:sessionId/items/:rubricItemId/photos',
  requireAuth,
  upload.single('photo'),
  async (req, res) => {
    const judgeId = req.session.judgeId;
    const sessionId = Number(req.params.sessionId);
    const rubricItemId = Number(req.params.rubricItemId);

    if (!Number.isInteger(sessionId) || !Number.isInteger(rubricItemId)) {
      if (req.file) await unlinkSafe(req.file.path);
      return res.status(400).json({ error: 'Invalid session or item id' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const sessionRow = await judgingPool.query(
        `SELECT s.id, s.judge_id, s.is_complete, sh.is_locked
           FROM judging_sessions s
           JOIN shows sh ON sh.id = s.show_id
          WHERE s.id = $1`,
        [sessionId],
      );
      if (sessionRow.rows.length === 0) {
        await unlinkSafe(req.file.path);
        return res.status(404).json({ error: 'Session not found' });
      }
      if (sessionRow.rows[0].judge_id !== judgeId) {
        await unlinkSafe(req.file.path);
        return res.status(403).json({ error: 'Session belongs to another judge' });
      }
      if (sessionRow.rows[0].is_complete) {
        await unlinkSafe(req.file.path);
        return res.status(409).json({ error: 'Session is submitted — cannot add photos' });
      }
      if (sessionRow.rows[0].is_locked) {
        await unlinkSafe(req.file.path);
        return res.status(409).json({ error: 'Show is locked — cannot add photos.' });
      }

      const deductionRow = await judgingPool.query(
        'SELECT id FROM deductions WHERE judging_session_id = $1 AND rubric_item_id = $2',
        [sessionId, rubricItemId],
      );
      if (deductionRow.rows.length === 0) {
        await unlinkSafe(req.file.path);
        return res.status(404).json({ error: 'Deduction row not found' });
      }
      const deductionId = deductionRow.rows[0].id;

      const photoRow = await judgingPool.query(
        `INSERT INTO photos (deduction_id, filepath, original_filename, file_size_bytes, mime_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          deductionId,
          path.basename(req.file.path),
          req.file.originalname,
          req.file.size,
          req.file.mimetype,
        ],
      );
      return res.json(photoRow.rows[0]);
    } catch (err) {
      await unlinkSafe(req.file.path);
      throw err;
    }
  },
);

// DELETE /api/photos/:photoId
router.delete('/photos/:photoId', requireAuth, async (req, res) => {
  const judgeId = req.session.judgeId;
  const photoId = Number(req.params.photoId);

  if (!Number.isInteger(photoId)) {
    return res.status(400).json({ error: 'Invalid photo id' });
  }

  const result = await judgingPool.query(
    `SELECT p.id, p.filepath, s.judge_id, s.is_complete, sh.is_locked
       FROM photos p
       JOIN deductions d ON d.id = p.deduction_id
       JOIN judging_sessions s ON s.id = d.judging_session_id
       JOIN shows sh ON sh.id = s.show_id
      WHERE p.id = $1`,
    [photoId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Photo not found' });
  }
  if (result.rows[0].judge_id !== judgeId) {
    return res.status(403).json({ error: 'Photo belongs to another judge' });
  }
  if (result.rows[0].is_complete) {
    return res.status(409).json({ error: 'Session is submitted — cannot delete photos' });
  }
  if (result.rows[0].is_locked) {
    return res.status(409).json({ error: 'Show is locked — cannot delete photos.' });
  }

  const filepath = path.join(UPLOAD_DIR, result.rows[0].filepath);
  await unlinkSafe(filepath);
  await judgingPool.query('DELETE FROM photos WHERE id = $1', [photoId]);

  res.json({ ok: true });
});

// Multer / fileFilter error handler — keep last in this router.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large (max 10 MB)' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err && err.message === 'Only image files are allowed') {
    return res.status(400).json({ error: 'Only image files are allowed' });
  }
  next(err);
});

module.exports = router;

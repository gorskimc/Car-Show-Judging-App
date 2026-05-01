// Gate API routes that require a logged-in judge.
function requireAuth(req, res, next) {
  if (!req.session?.judgeId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

module.exports = { requireAuth };

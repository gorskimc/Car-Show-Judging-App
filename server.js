const path = require('path');
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the static PWA shell from /public
app.use(express.static(path.join(__dirname, 'public')));

// Liveness check — used by hosts and during local smoke tests.
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Car Show Judging App listening on http://localhost:${PORT}`);
});

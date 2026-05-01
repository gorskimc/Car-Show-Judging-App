const { Pool, types } = require('pg');
require('dotenv').config();

// Return NUMERIC values as JS numbers instead of strings. Our point values
// only need ~5 digits and ¼-point precision, well within JS Number safety.
// Without this, deduction_amount and max_points come back as strings.
types.setTypeParser(types.builtins.NUMERIC, (val) => parseFloat(val));

const baseConfig = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
};

// Read-only by convention. We never write SQL that mutates the partner's
// corvetteisland database. Used for participant -> customer lookups.
const customersPool = new Pool({
  ...baseConfig,
  database: process.env.CUSTOMERS_DB,
});

// Read-write. Owns judges, rubric, sessions, deductions, photos.
const judgingPool = new Pool({
  ...baseConfig,
  database: process.env.JUDGING_DB,
});

// Postgres can drop idle connections at any time; if we don't listen for
// 'error' events on idle clients, the Node process crashes when one fires.
customersPool.on('error', (err) => {
  console.error('Unexpected error on idle customersPool client:', err);
});
judgingPool.on('error', (err) => {
  console.error('Unexpected error on idle judgingPool client:', err);
});

module.exports = { customersPool, judgingPool };

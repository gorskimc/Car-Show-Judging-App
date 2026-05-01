// One-shot DESTRUCTIVE setup script for the `judging` database.
// Drops the existing judging DB (if any), recreates it from db/schema.sql
// and db/seed.sql. The partner's corvetteisland DB is never touched.
//
// Run with:  npm run setup-db
// Requires "yes" confirmation at runtime.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('pg');
require('dotenv').config();

const judgingDb = process.env.JUDGING_DB;
const customersDb = process.env.CUSTOMERS_DB;

const adminConfig = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: 'postgres', // admin database for CREATE/DROP DATABASE
};

// Hard guard: never run if the configured judging DB name somehow points
// at the partner's customers DB. This should be impossible, but cheap to enforce.
if (!judgingDb || judgingDb === customersDb) {
  console.error(`Refusing to run: JUDGING_DB ("${judgingDb}") is missing or equals CUSTOMERS_DB ("${customersDb}").`);
  process.exit(1);
}

// DB names can't be parameterized in SQL. Validate the name before
// interpolating it into DROP / CREATE statements.
if (!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(judgingDb)) {
  console.error(`Refusing to run: JUDGING_DB "${judgingDb}" is not a safe identifier.`);
  process.exit(1);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  console.log('');
  console.log(`This will DROP the "${judgingDb}" database and recreate it from`);
  console.log('  db/schema.sql + db/seed.sql.');
  console.log('All judges, sessions, deductions, and photos will be lost.');
  console.log(`The "${customersDb}" database is NOT touched.`);
  console.log('');

  const answer = await ask('Type "yes" to proceed (anything else aborts): ');
  if (answer !== 'yes') {
    console.log('Aborted. Nothing changed.');
    process.exit(0);
  }

  // Step 1 — drop + recreate the database (admin connection)
  const adminClient = new Client(adminConfig);
  try {
    await adminClient.connect();
    console.log(`Terminating existing connections to "${judgingDb}"...`);
    await adminClient.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [judgingDb],
    );
    console.log(`Dropping "${judgingDb}" if it exists...`);
    await adminClient.query(`DROP DATABASE IF EXISTS ${judgingDb}`);
    console.log(`Creating "${judgingDb}"...`);
    await adminClient.query(`CREATE DATABASE ${judgingDb}`);
  } finally {
    await adminClient.end();
  }

  // Step 2 — apply schema.sql + seed.sql
  const judgingClient = new Client({ ...adminConfig, database: judgingDb });
  try {
    await judgingClient.connect();

    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    const seedPath = path.join(__dirname, '..', 'db', 'seed.sql');

    console.log(`Applying ${path.relative(process.cwd(), schemaPath)}...`);
    await judgingClient.query(fs.readFileSync(schemaPath, 'utf8'));

    console.log(`Applying ${path.relative(process.cwd(), seedPath)}...`);
    await judgingClient.query(fs.readFileSync(seedPath, 'utf8'));

    // Step 3 — print row counts as a sanity check
    const summary = await judgingClient.query(`
      SELECT 'shows'              AS rel, COUNT(*)::int AS rows FROM shows
      UNION ALL SELECT 'judges',              COUNT(*)::int FROM judges
      UNION ALL SELECT 'rubric_sections',     COUNT(*)::int FROM rubric_sections
      UNION ALL SELECT 'rubric_subsections',  COUNT(*)::int FROM rubric_subsections
      UNION ALL SELECT 'rubric_items',        COUNT(*)::int FROM rubric_items
      UNION ALL SELECT 'judging_sessions',    COUNT(*)::int FROM judging_sessions
      UNION ALL SELECT 'deductions',          COUNT(*)::int FROM deductions
      UNION ALL SELECT 'photos',              COUNT(*)::int FROM photos
      ORDER BY rel
    `);

    console.log('');
    console.log(`Done. "${judgingDb}" is fresh:`);
    for (const row of summary.rows) {
      console.log(`  ${row.rel.padEnd(20)} ${String(row.rows).padStart(5)} rows`);
    }
  } finally {
    await judgingClient.end();
  }
}

main().catch((err) => {
  console.error('');
  console.error('Setup failed:', err.message);
  process.exit(1);
});

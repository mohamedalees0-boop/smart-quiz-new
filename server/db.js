const { Pool } = require('pg');
const { seedIfEmpty } = require('./seed');

const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const isLocal = !conn || /localhost|127\.0\.0\.1/.test(conn);

const pool = conn
  ? new Pool({
      connectionString: conn,
      max: 5,
      idleTimeoutMillis: 10000,
      ssl: isLocal || /sslmode=/.test(conn) ? undefined : { rejectUnauthorized: false },
    })
  : null;
if (pool) pool.on('error', (e) => console.error('Postgres pool error:', e.message));

function needPool() {
  if (!pool) throw new Error('DATABASE_URL is not set. Connect a Postgres database to this project.');
  return pool;
}
const query = (text, params) => needPool().query(text, params);
const all = async (text, params) => (await query(text, params)).rows;
const one = async (text, params) => (await query(text, params)).rows[0];

async function tx(fn) {
  const client = await needPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS questions (
  id          SERIAL PRIMARY KEY,
  category    TEXT NOT NULL,
  text        TEXT NOT NULL,
  options     TEXT NOT NULL,
  answer      INTEGER NOT NULL,
  difficulty  INTEGER NOT NULL DEFAULT 2,
  explanation TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
CREATE TABLE IF NOT EXISTS attempts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  mode       TEXT NOT NULL DEFAULT 'smart',
  score      INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  points     INTEGER NOT NULL,
  duration   INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE TABLE IF NOT EXISTS attempt_answers (
  id          SERIAL PRIMARY KEY,
  attempt_id  INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected    TEXT,
  correct     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aa_attempt ON attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_aa_question ON attempt_answers(question_id);
`;

// Creates tables and loads sample questions once. Safe to call many times.
let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(727401)'); // stops two cold starts from racing
      await c.query(SCHEMA);
      await seedIfEmpty(c);
    }).catch((e) => {
      readyPromise = null; // allow a retry on the next request
      throw e;
    });
  }
  return readyPromise;
}

module.exports = { query, all, one, tx, ready };

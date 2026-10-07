const router = require('express').Router();
const db = require('../db');
const wrap = require('../middleware/wrap');
const { auth } = require('../middleware/auth');

const SECONDS_PER_QUESTION = 30;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Weighted random pick without replacement
function weightedSample(items, weights, k) {
  const pool = items.map((item, i) => ({ item, w: weights[i] }));
  const out = [];
  while (out.length < k && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    out.push(pool.splice(idx, 1)[0].item);
  }
  return out;
}

router.get('/categories', auth, wrap(async (req, res) => {
  res.json(await db.all('SELECT category AS name, COUNT(*)::int AS count FROM questions GROUP BY category ORDER BY category'));
}));

// Start a quiz. Correct answers are NEVER sent to the browser.
router.get('/quiz/start', auth, wrap(async (req, res) => {
  const category = String(req.query.category || 'all');
  const count = Math.min(Math.max(parseInt(req.query.count, 10) || 10, 3), 30);
  const mode = req.query.mode === 'random' ? 'random' : 'smart';

  const rows =
    category === 'all'
      ? await db.all('SELECT * FROM questions')
      : await db.all('SELECT * FROM questions WHERE category = $1', [category]);
  if (!rows.length) return res.status(404).json({ error: 'No questions found for that topic.' });

  let picked;
  if (mode === 'smart') {
    // Smart mode: favour questions you got wrong, then ones you have never seen,
    // and show mastered questions less often.
    const history = await db.all(
      `SELECT aa.question_id AS qid, COUNT(*)::int AS n, SUM(aa.correct)::int AS c
       FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
       WHERE a.user_id = $1 GROUP BY aa.question_id`,
      [req.user.id]
    );
    const seen = new Map(history.map((h) => [h.qid, h]));
    const weights = rows.map((q) => {
      const s = seen.get(q.id);
      if (!s) return 3;                          // never seen
      const acc = s.c / s.n;
      if (acc < 0.5) return 6;                   // weak spot
      if (acc >= 0.8 && s.n >= 2) return 0.7;    // mastered
      return 2;
    });
    picked = weightedSample(rows, weights, count);
  } else {
    picked = shuffle(rows.slice()).slice(0, count);
  }

  const questions = shuffle(picked).map((q) => ({
    id: q.id,
    category: q.category,
    difficulty: q.difficulty,
    text: q.text,
    options: shuffle(JSON.parse(q.options)),
  }));

  res.json({ category, mode, limit: questions.length * SECONDS_PER_QUESTION, questions });
}));

// Submit answers. Grading happens on the server only.
router.post('/quiz/submit', auth, wrap(async (req, res) => {
  const { category = 'all', mode = 'smart', answers, duration } = req.body || {};
  if (!Array.isArray(answers) || !answers.length || answers.length > 50) {
    return res.status(400).json({ error: 'No answers were sent.' });
  }
  const ids = [...new Set(answers.map((a) => Number(a.id)).filter(Number.isInteger))];
  if (!ids.length) return res.status(400).json({ error: 'No valid questions were sent.' });

  const qs = await db.all('SELECT * FROM questions WHERE id = ANY($1::int[])', [ids]);
  const byId = new Map(qs.map((q) => [q.id, q]));
  const answerOf = new Map(answers.map((a) => [Number(a.id), a.selected]));

  const limit = ids.length * SECONDS_PER_QUESTION;
  const dur = Math.min(Math.max(Math.round(Number(duration)) || limit, 1), limit * 2);

  const results = [];
  let score = 0;
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) continue;
    const correctText = JSON.parse(q.options)[q.answer];
    const sel = answerOf.get(id);
    const selected = typeof sel === 'string' ? sel : null;
    const isCorrect = selected === correctText;
    if (isCorrect) score++;
    results.push({ id, text: q.text, selected, correct: correctText, isCorrect, explanation: q.explanation });
  }

  const total = results.length;
  if (!total) return res.status(400).json({ error: 'No valid questions were sent.' });

  // 10 points per correct answer + up to 5 bonus points per correct answer for speed
  const bonus = Math.round(score * 5 * Math.max(0, 1 - dur / limit));
  const points = score * 10 + bonus;

  const attemptId = await db.tx(async (c) => {
    const r = await c.query(
      `INSERT INTO attempts (user_id, category, mode, score, total, points, duration)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.user.id, String(category).slice(0, 60), mode === 'random' ? 'random' : 'smart', score, total, points, dur]
    );
    const id = r.rows[0].id;
    await c.query(
      `INSERT INTO attempt_answers (attempt_id, question_id, selected, correct)
       SELECT $1::int, t.q, t.s, t.c FROM unnest($2::int[], $3::text[], $4::int[]) AS t(q, s, c)`,
      [id, results.map((x) => x.id), results.map((x) => x.selected), results.map((x) => (x.isCorrect ? 1 : 0))]
    );
    return id;
  });

  res.json({ attemptId, score, total, points, bonus, duration: dur, results });
}));

// Personal dashboard data
router.get('/me/stats', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const totals = await db.one(
    `SELECT COUNT(*)::int AS quizzes, COALESCE(SUM(score),0)::int AS correct,
            COALESCE(SUM(total),0)::int AS answered, COALESCE(SUM(points),0)::int AS points
     FROM attempts WHERE user_id = $1`,
    [uid]
  );
  const byCategory = (
    await db.all(
      `SELECT q.category AS name, COUNT(*)::int AS n, SUM(aa.correct)::int AS c
       FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
       JOIN questions q ON q.id = aa.question_id
       WHERE a.user_id = $1 GROUP BY q.category ORDER BY q.category`,
      [uid]
    )
  ).map((r) => ({ name: r.name, answered: r.n, accuracy: Math.round((r.c / r.n) * 100) }));

  const weak = (
    await db.all(
      `SELECT q.text, q.category, COUNT(*)::int AS n, SUM(aa.correct)::int AS c
       FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
       JOIN questions q ON q.id = aa.question_id
       WHERE a.user_id = $1
       GROUP BY q.id, q.text, q.category
       HAVING SUM(aa.correct) < COUNT(*)
       ORDER BY SUM(aa.correct)::float / COUNT(*) ASC, COUNT(*) DESC LIMIT 5`,
      [uid]
    )
  ).map((r) => ({ text: r.text, category: r.category, tries: r.n, accuracy: Math.round((r.c / r.n) * 100) }));

  const recent = await db.all(
    `SELECT category, mode, score, total, points, created_at
     FROM attempts WHERE user_id = $1 ORDER BY id DESC LIMIT 8`,
    [uid]
  );

  res.json({
    quizzes: totals.quizzes,
    answered: totals.answered,
    points: totals.points,
    accuracy: totals.answered ? Math.round((totals.correct / totals.answered) * 100) : 0,
    byCategory,
    weak,
    recent,
  });
}));

// Global leaderboard
router.get('/leaderboard', auth, wrap(async (req, res) => {
  const rows = await db.all(
    `SELECT u.id, u.name, SUM(a.points)::int AS points, COUNT(*)::int AS quizzes,
            ROUND(SUM(a.score) * 100.0 / SUM(a.total))::int AS accuracy
     FROM attempts a JOIN users u ON u.id = a.user_id
     GROUP BY u.id, u.name ORDER BY SUM(a.points) DESC LIMIT 20`
  );
  res.json(rows.map((r) => ({ name: r.name, points: r.points, quizzes: r.quizzes, accuracy: r.accuracy, you: r.id === req.user.id })));
}));

module.exports = router;

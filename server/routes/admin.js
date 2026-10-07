const router = require('express').Router();
const db = require('../db');
const wrap = require('../middleware/wrap');
const { auth, adminOnly } = require('../middleware/auth');

router.use(auth, adminOnly);

function cleanQuestion(q) {
  const category = String(q?.category || '').trim().slice(0, 40);
  const text = String(q?.text || '').trim().slice(0, 500);
  const options = Array.isArray(q?.options) ? q.options.map((o) => String(o).trim().slice(0, 200)) : [];
  const answer = Number(q?.answer);
  const difficulty = [1, 2, 3].includes(Number(q?.difficulty)) ? Number(q.difficulty) : 2;
  const explanation = String(q?.explanation || '').trim().slice(0, 500);

  if (!category) return { error: 'Category is required.' };
  if (text.length < 5) return { error: 'Question text is too short.' };
  if (options.length < 2 || options.length > 6 || options.some((o) => !o)) return { error: 'Give 2 to 6 non-empty options.' };
  if (new Set(options).size !== options.length) return { error: 'Options must be different from each other.' };
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return { error: 'Pick which option is correct.' };
  return { value: { category, text, options, answer, difficulty, explanation } };
}

const INSERT_Q =
  'INSERT INTO questions (category, text, options, answer, difficulty, explanation) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id';
const qParams = (v) => [v.category, v.text, JSON.stringify(v.options), v.answer, v.difficulty, v.explanation];

router.get('/overview', wrap(async (req, res) => {
  const [u, q, a] = await Promise.all([
    db.one('SELECT COUNT(*)::int AS n FROM users'),
    db.one('SELECT COUNT(*)::int AS n FROM questions'),
    db.one('SELECT COUNT(*)::int AS n FROM attempts'),
  ]);
  res.json({ users: u.n, questions: q.n, attempts: a.n, aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY) });
}));

router.get('/questions', wrap(async (req, res) => {
  const rows = await db.all('SELECT * FROM questions ORDER BY id DESC LIMIT 300');
  res.json(rows.map((r) => ({ ...r, options: JSON.parse(r.options) })));
}));

router.post('/questions', wrap(async (req, res) => {
  const { value, error } = cleanQuestion(req.body);
  if (error) return res.status(400).json({ error });
  const row = await db.one(INSERT_Q, qParams(value));
  res.status(201).json({ id: row.id });
}));

// Save many questions at once (used by the AI generator and JSON import)
router.post('/questions/bulk', wrap(async (req, res) => {
  const list = Array.isArray(req.body?.questions) ? req.body.questions.slice(0, 100) : [];
  let saved = 0;
  await db.tx(async (c) => {
    for (const q of list) {
      const { value } = cleanQuestion(q);
      if (value) { await c.query(INSERT_Q, qParams(value)); saved++; }
    }
  });
  res.json({ saved, skipped: list.length - saved });
}));

router.delete('/questions/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM questions WHERE id = $1', [Number(req.params.id) || 0]);
  res.json({ ok: true });
}));

// AI question generator (optional, needs ANTHROPIC_API_KEY)
router.post('/generate', wrap(async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI is not set up. Add ANTHROPIC_API_KEY to your environment variables.' });

  const topic = String(req.body?.topic || '').trim().slice(0, 100);
  const count = Math.min(Math.max(parseInt(req.body?.count, 10) || 5, 1), 10);
  const difficulty = [1, 2, 3].includes(Number(req.body?.difficulty)) ? Number(req.body.difficulty) : 2;
  if (topic.length < 2) return res.status(400).json({ error: 'Enter a topic.' });

  const prompt =
    `Write ${count} multiple-choice quiz questions about "${topic}" at difficulty ${difficulty} ` +
    `(1 = easy, 2 = medium, 3 = hard). Return ONLY a JSON array with no markdown and no extra text. ` +
    `Each item must be: {"text": string, "options": [exactly 4 different strings], ` +
    `"answer": index 0-3 of the correct option, "explanation": one short sentence}.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || 'AI request failed');
    const raw = (data.content || []).map((c) => c.text || '').join('').replace(/```json|```/g, '').trim();
    const questions = JSON.parse(raw)
      .map((q) => cleanQuestion({ ...q, category: topic, difficulty }).value)
      .filter(Boolean);
    if (!questions.length) throw new Error('AI returned no usable questions. Try again.');
    res.json({ questions });
  } catch (e) {
    res.status(502).json({ error: 'Could not generate questions: ' + e.message });
  }
}));

module.exports = router;

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const wrap = require('../middleware/wrap');
const { sign, auth } = require('../middleware/auth');

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

router.post('/register', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Name must be 2 to 40 characters.' });
  if (!emailRe.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const taken = { error: 'That email is already registered. Try logging in.' };
  if (await db.one('SELECT 1 FROM users WHERE email = $1', [email])) return res.status(409).json(taken);

  const isFirst = (await db.one('SELECT COUNT(*)::int AS n FROM users')).n === 0;
  const isAdminEmail = process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL.toLowerCase() === email;
  const role = isFirst || isAdminEmail ? 'admin' : 'user';

  try {
    const row = await db.one(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id',
      [name, email, bcrypt.hashSync(password, 10), role]
    );
    const user = { id: row.id, name, email, role };
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json(taken);
    throw e;
  }
}));

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = await db.one('SELECT * FROM users WHERE email = $1', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email or password is wrong.' });
  }
  res.json({ token: sign(user), user: publicUser(user) });
}));

router.get('/me', auth, (req, res) => res.json({ user: req.user }));

module.exports = router;

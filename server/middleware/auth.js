const jwt = require('jsonwebtoken');
const db = require('../db');
const wrap = require('./wrap');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

function sign(user) {
  return jwt.sign({ uid: user.id }, SECRET, { expiresIn: '7d' });
}

const auth = wrap(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in first.' });

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: 'Your session expired. Please log in again.' });
  }
  const user = await db.one('SELECT id, name, email, role FROM users WHERE id = $1', [payload.uid]);
  if (!user) return res.status(401).json({ error: 'Account not found. Please log in again.' });
  req.user = user;
  next();
});

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access only.' });
  next();
}

module.exports = { sign, auth, adminOnly };

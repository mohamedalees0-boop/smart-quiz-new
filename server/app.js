require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const db = require('./db');
const wrap = require('./middleware/wrap');

const isProd = process.env.NODE_ENV === 'production';
const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ['https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
  })
);
app.use(compression());
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Make sure the server is configured and the database tables exist before any API call
app.use('/api', wrap(async (req, res, next) => {
  if (isProd && !process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Server setup incomplete: JWT_SECRET is not set.' });
  }
  try {
    await db.ready();
  } catch (e) {
    console.error('Database setup failed:', e.message);
    const msg = e.message.startsWith('DATABASE_URL') ? e.message : 'Cannot connect to the database. Check DATABASE_URL.';
    return res.status(500).json({ error: msg });
  }
  next();
}));

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/quiz'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Bad request.' : 'Server error. Please try again.' });
});

module.exports = app;

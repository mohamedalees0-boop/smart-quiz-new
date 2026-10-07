// Local / Docker entry. On Vercel, api/index.js is used instead.
const path = require('path');
const express = require('express');
const app = require('./app');

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Smart Quiz running on http://localhost:${PORT}`));

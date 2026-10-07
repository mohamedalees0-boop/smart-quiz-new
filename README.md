# Smart Quiz

Full-stack quiz platform. **Smart mode** remembers the questions you got wrong and shows them more often.

Stack: Express API + Postgres (Neon) + vanilla JS frontend. Deploys to Vercel.

## Features
- Register / login (JWT, bcrypt)
- Timed quizzes, keyboard shortcuts (A, B, C, D), Smart and Random modes
- Server-side grading (answers never sent to the browser while playing)
- Points + speed bonus, progress dashboard, leaderboard
- Admin panel: add/delete questions, import JSON, optional AI question generator

## Structure
```
api/index.js        Vercel function entry (wraps the Express app)
server/app.js       Express app (routes, security, DB readiness)
server/index.js     Local / Docker entry (adds static files + listen)
server/db.js        Postgres pool, schema, auto-setup
server/seed.js      30 sample questions (loaded on first request)
server/routes/      auth, quiz, admin
public/             frontend (index.html, css, js)
vercel.json         Vercel settings
```

## Deploy on Vercel
1. Push this code to GitHub, import the repo in Vercel.
2. Project > **Storage** > Create Database > **Neon (Postgres)** > connect to the project. This adds `DATABASE_URL` automatically.
3. Project > Settings > **Environment Variables**, add:
   - `JWT_SECRET` = a long random text
   - `ADMIN_EMAIL` = your email
   - `ANTHROPIC_API_KEY` = optional, for AI question generation
4. Redeploy. Open the site and register with your email. You become the admin.

Tables are created and sample questions are loaded automatically on the first request.

## Run on your computer
```bash
npm install
cp .env.example .env    # then put your Neon DATABASE_URL and a JWT_SECRET inside
npm start               # http://localhost:3000
```

## Environment variables
| Name | Required | Meaning |
|------|----------|---------|
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | production | Long random string for login tokens |
| `ADMIN_EMAIL` | no | This email becomes admin when it registers |
| `ANTHROPIC_API_KEY` | no | Turns on AI question generation |

(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $app = document.getElementById('app');
  const $nav = document.getElementById('nav');
  const $toast = document.getElementById('toast');
  const LETTERS = 'ABCDEF';

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
  const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  const store = {
    get token() { try { return localStorage.getItem('sq_token'); } catch { return null; } },
    set token(v) { try { v ? localStorage.setItem('sq_token', v) : localStorage.removeItem('sq_token'); } catch { /* ignore */ } },
  };

  const state = {
    user: null, authMode: 'login', mode: 'smart', count: 10,
    quiz: null, result: null, adminTab: 'questions', aiPreview: [],
  };
  let timer = null;

  let toastTimer;
  function toast(msg, bad = false) {
    $toast.textContent = msg;
    $toast.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($toast.className = 'toast'), 3200);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: 'Bearer ' + store.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && store.token) {
      store.token = null; state.user = null;
      location.hash = '#/login';
    }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  // CSP blocks style="" in markup, so widths are applied through the DOM instead.
  function applyBars() {
    document.querySelectorAll('[data-w]').forEach((e) => (e.style.width = e.dataset.w + '%'));
    document.querySelectorAll('[data-ring]').forEach((e) => e.style.setProperty('--p', e.dataset.ring));
  }

  /* ---------- nav ---------- */
  function renderNav() {
    const here = location.hash.slice(1) || '/';
    if (!state.user) {
      $nav.innerHTML = `<a class="brand" href="#/login"><span class="mark"></span>Smart Quiz</a>`;
      return;
    }
    const link = (href, label) => `<a href="#${href}" class="${here === href ? 'on' : ''}">${label}</a>`;
    $nav.innerHTML = `
      <a class="brand" href="#/"><span class="mark"></span>Smart Quiz</a>
      <nav class="links" aria-label="Main">
        ${link('/', 'Practice')}${link('/dashboard', 'My progress')}${link('/leaderboard', 'Leaderboard')}
        ${state.user.role === 'admin' ? link('/admin', 'Admin') : ''}
      </nav>
      <div class="who"><span>${esc(state.user.name)}</span><button class="btn btn-ghost" data-action="logout">Log out</button></div>`;
  }

  /* ---------- views ---------- */
  function authView() {
    const reg = state.authMode === 'register';
    $app.innerHTML = `
      <div class="auth">
        <div>
          <h1>Practice what you keep missing.</h1>
          <p class="muted">Smart mode watches which questions you get wrong and brings them back until you know them.</p>
          <div class="demo" aria-hidden="true">
            <div class="demo-row"><span class="n">1</span><span class="dot"></span><span class="dot f"></span><span class="dot"></span><span class="dot"></span></div>
            <div class="demo-row"><span class="n">2</span><span class="dot r"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
            <div class="demo-row"><span class="n">3</span><span class="dot"></span><span class="dot"></span><span class="dot f"></span><span class="dot"></span></div>
          </div>
        </div>
        <form class="sheet ticks" data-form="auth" novalidate>
          <h2>${reg ? 'Create your account' : 'Log in'}</h2>
          ${reg ? `<div class="field"><label for="name">Name</label><input id="name" name="name" autocomplete="name" required></div>` : ''}
          <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6"></div>
          <p class="err" id="autherr"></p>
          <button class="btn btn-primary" type="submit">${reg ? 'Create account' : 'Log in'}</button>
          <p class="small muted">${reg ? 'Already have an account?' : 'New here?'}
            <button type="button" class="link" data-action="toggle-auth">${reg ? 'Log in' : 'Create an account'}</button></p>
        </form>
      </div>`;
  }

  async function homeView() {
    const cats = await api('/categories');
    const total = cats.reduce((s, c) => s + c.count, 0);
    const seg = (name, opts, cur) =>
      `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-action="set-${name}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
    $app.innerHTML = `
      <h1>Hi ${esc(state.user.name.split(' ')[0])}, what are we practising?</h1>
      <p class="muted">Smart mode brings back the questions you missed. Random mode picks any questions.</p>
      <div class="controls">
        <div><label>Mode</label>${seg('mode', [['smart', 'Smart'], ['random', 'Random']], state.mode)}</div>
        <div><label>Questions</label>${seg('count', [[5, '5'], [10, '10'], [15, '15'], [20, '20']], state.count)}</div>
      </div>
      ${cats.length ? `<div class="grid">
        <button class="tile all" data-action="start" data-cat="all"><h3>All topics</h3><span class="count">${total} questions mixed</span></button>
        ${cats.map((c) => `<button class="tile" data-action="start" data-cat="${esc(c.name)}"><h3>${esc(c.name)}</h3><span class="count">${c.count} questions</span></button>`).join('')}
      </div>` : `<div class="sheet empty">No questions yet. An admin needs to add some first.</div>`}`;
  }

  async function startQuiz(category) {
    const q = await api(`/quiz/start?category=${encodeURIComponent(category)}&count=${state.count}&mode=${state.mode}`);
    state.quiz = { ...q, idx: 0, answers: [], startedAt: Date.now(), locked: false };
    location.hash = '#/quiz';
  }

  function quizView() {
    const qz = state.quiz;
    if (!qz) { location.hash = '#/'; return; }
    const n = qz.questions.length;

    const draw = () => {
      const item = qz.questions[qz.idx];
      const left = qz.limit - Math.floor((Date.now() - qz.startedAt) / 1000);
      $app.innerHTML = `
        <div class="sheet ticks">
          <div class="qhead">
            <span>${esc(qz.category === 'all' ? 'All topics' : qz.category)} &middot; Question ${qz.idx + 1} of ${n}</span>
            <span class="timer ${left <= 30 ? 'low' : ''}" id="timer" aria-label="Time left">${fmtTime(left)}</span>
          </div>
          <div class="progress"><i data-w="${Math.round((qz.idx / n) * 100)}"></i></div>
          <span class="diff">${['', 'Easy', 'Medium', 'Hard'][item.difficulty] || ''}</span>
          <p class="qtext">${esc(item.text)}</p>
          <div class="opts">
            ${item.options.map((o, i) => `<button class="opt" data-action="pick" data-i="${i}"><span class="bubble">${LETTERS[i]}</span><span>${esc(o)}</span></button>`).join('')}
          </div>
          <div class="row between">
            <button class="btn btn-sm" data-action="skip">Skip</button>
            <span class="small muted">Tip: press ${LETTERS.slice(0, item.options.length).split('').join(', ')} on your keyboard</span>
          </div>
        </div>`;
      applyBars();
    };

    qz.draw = draw;
    draw();
    clearInterval(timer);
    timer = setInterval(() => {
      const left = qz.limit - Math.floor((Date.now() - qz.startedAt) / 1000);
      const el = document.getElementById('timer');
      if (el) { el.textContent = fmtTime(left); el.classList.toggle('low', left <= 30); }
      if (left <= 0) finishQuiz();
    }, 1000);
  }

  function answer(selected, btn) {
    const qz = state.quiz;
    if (!qz || qz.locked) return;
    qz.locked = true;
    if (btn) btn.classList.add('picked');
    qz.answers[qz.idx] = { id: qz.questions[qz.idx].id, selected };
    setTimeout(() => {
      qz.locked = false;
      if (qz.idx < qz.questions.length - 1) { qz.idx++; qz.draw(); } else finishQuiz();
    }, 260);
  }

  let finishing = false;
  async function finishQuiz() {
    const qz = state.quiz;
    if (!qz || finishing) return;
    finishing = true;
    clearInterval(timer);
    $app.innerHTML = `<div class="sheet empty">Checking your answers...</div>`;
    const answers = qz.questions.map((q, i) => qz.answers[i] || { id: q.id, selected: null });
    try {
      state.result = await api('/quiz/submit', {
        method: 'POST',
        body: { category: qz.category, mode: qz.mode, answers, duration: Math.round((Date.now() - qz.startedAt) / 1000) },
      });
      state.result.category = qz.category;
      state.quiz = null;
      location.hash = '#/result';
    } catch (e) {
      toast(e.message, true);
      state.quiz = null;
      location.hash = '#/';
    } finally {
      finishing = false;
    }
  }

  function resultView() {
    const r = state.result;
    if (!r) { location.hash = '#/'; return; }
    const pct = Math.round((r.score / r.total) * 100);
    const msg = pct >= 90 ? 'Excellent work.' : pct >= 70 ? 'Good job. A little more practice will lock it in.' : pct >= 40 ? 'Getting there. Smart mode will bring back what you missed.' : 'Tough round. Review the answers below, then try again.';
    const missed = r.results.filter((x) => !x.isCorrect).length;
    $app.innerHTML = `
      <div class="sheet ticks">
        <div class="score">
          <div class="ring" data-ring="${pct}"><div>${r.score}/${r.total}</div></div>
          <div>
            <h1>${pct}%</h1>
            <p class="muted">${msg}</p>
            <div class="chips">
              <span class="chip y">+${r.points} points</span>
              ${r.bonus ? `<span class="chip">${r.bonus} speed bonus</span>` : ''}
              <span class="chip">${fmtTime(r.duration)} taken</span>
            </div>
          </div>
        </div>
        <div class="row">
          <button class="btn btn-primary" data-action="start" data-cat="${esc(r.category)}">Practise this topic again</button>
          <a class="btn" href="#/dashboard">My progress</a>
          <a class="btn" href="#/">Pick another topic</a>
        </div>
      </div>
      <h2 class="mt">Review ${missed ? `(${missed} missed)` : ''}</h2>
      <div class="review">
        ${r.results.map((x, i) => `
          <div class="rv ${x.isCorrect ? '' : 'bad'}">
            <span class="tag">${x.isCorrect ? 'Correct' : x.selected ? 'Missed' : 'Not answered'}</span>
            <p class="q">${i + 1}. ${esc(x.text)}</p>
            ${x.isCorrect ? `<div>${esc(x.correct)}</div>` : `
              <div>${x.selected ? `Your answer: ${esc(x.selected)}<br>` : ''}Correct answer: <b>${esc(x.correct)}</b></div>`}
            ${x.explanation ? `<p class="exp">${esc(x.explanation)}</p>` : ''}
          </div>`).join('')}
      </div>`;
  }

  async function dashView() {
    const s = await api('/me/stats');
    const lvl = (a) => (a >= 75 ? '' : a >= 50 ? 'mid' : 'low');
    $app.innerHTML = `
      <h1>My progress</h1>
      <div class="stats">
        <div class="stat"><b>${s.quizzes}</b><span>Quizzes taken</span></div>
        <div class="stat"><b>${s.answered}</b><span>Questions answered</span></div>
        <div class="stat"><b>${s.accuracy}%</b><span>Overall accuracy</span></div>
        <div class="stat"><b>${s.points}</b><span>Points</span></div>
      </div>
      <div class="sheet">
        <h2>Accuracy by topic</h2>
        ${s.byCategory.length ? s.byCategory.map((c) => `
          <div class="bar"><span>${esc(c.name)}</span>
            <span class="track"><span class="fill ${lvl(c.accuracy)}" data-w="${c.accuracy}"></span></span>
            <b>${c.accuracy}%</b></div>`).join('') : `<p class="empty">Take a quiz to see your topics here.</p>`}
      </div>
      <div class="sheet">
        <h2>Weak spots</h2>
        ${s.weak.length ? `<div class="tablewrap"><table><thead><tr><th>Question</th><th>Topic</th><th>Accuracy</th></tr></thead><tbody>
          ${s.weak.map((w) => `<tr><td>${esc(w.text)}</td><td>${esc(w.category)}</td><td>${w.accuracy}% (${w.tries} tries)</td></tr>`).join('')}
        </tbody></table></div>` : `<p class="empty">No weak spots yet. Nice.</p>`}
      </div>
      <div class="sheet">
        <h2>Recent quizzes</h2>
        ${s.recent.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Topic</th><th>Mode</th><th>Score</th><th>Points</th></tr></thead><tbody>
          ${s.recent.map((r) => `<tr><td>${fmtDate(r.created_at)}</td><td>${esc(r.category === 'all' ? 'All topics' : r.category)}</td><td>${esc(r.mode)}</td><td>${r.score}/${r.total}</td><td>${r.points}</td></tr>`).join('')}
        </tbody></table></div>` : `<p class="empty">Your quizzes will show up here. <a href="#/">Start one</a>.</p>`}
      </div>`;
  }

  async function boardView() {
    const rows = await api('/leaderboard');
    $app.innerHTML = `
      <h1>Leaderboard</h1>
      <p class="muted">Top 20 players by total points. Faster correct answers earn bonus points.</p>
      <div class="sheet tablewrap">
        ${rows.length ? `<table><thead><tr><th>#</th><th>Player</th><th>Points</th><th>Quizzes</th><th>Accuracy</th></tr></thead><tbody>
          ${rows.map((r, i) => `<tr class="${r.you ? 'you' : ''}"><td>${i + 1}</td><td>${esc(r.name)}${r.you ? ' (you)' : ''}</td><td>${r.points}</td><td>${r.quizzes}</td><td>${r.accuracy}%</td></tr>`).join('')}
        </tbody></table>` : `<p class="empty">Nobody has played yet. Be the first.</p>`}
      </div>`;
  }

  async function adminView() {
    if (state.user.role !== 'admin') { location.hash = '#/'; return; }
    const [ov, qs] = await Promise.all([api('/admin/overview'), api('/admin/questions')]);
    const cats = [...new Set(qs.map((q) => q.category))];
    const tab = state.adminTab;
    const tabBtn = (id, label) => `<button type="button" data-action="admin-tab" data-v="${id}" aria-pressed="${tab === id}">${label}</button>`;

    let body = '';
    if (tab === 'questions') {
      body = qs.length ? qs.map((q) => `
        <div class="q-item"><div><b>${esc(q.text)}</b><br>
          <small>${esc(q.category)} &middot; ${['', 'Easy', 'Medium', 'Hard'][q.difficulty]} &middot; Answer: ${esc(q.options[q.answer])}</small></div>
          <button class="btn btn-danger btn-sm" data-action="del-q" data-id="${q.id}">Delete</button></div>`).join('')
        : `<p class="empty">No questions yet.</p>`;
    } else if (tab === 'add') {
      body = `<form data-form="add-q" novalidate>
        <div class="cols">
          <div class="field"><label for="cat">Topic</label><input id="cat" name="category" list="catlist" required><datalist id="catlist">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div class="field"><label for="diff">Difficulty</label><select id="diff" name="difficulty"><option value="1">Easy</option><option value="2" selected>Medium</option><option value="3">Hard</option></select></div>
        </div>
        <div class="field"><label for="qt">Question</label><textarea id="qt" name="text" required></textarea></div>
        <div class="field"><label>Options (select the correct one)</label>
          <div class="opts-edit">${[0, 1, 2, 3].map((i) => `<div class="oe"><input type="radio" name="correct" value="${i}" aria-label="Option ${LETTERS[i]} is correct" ${i === 0 ? 'checked' : ''}><input name="opt${i}" placeholder="Option ${LETTERS[i]}${i > 1 ? ' (optional)' : ''}"></div>`).join('')}</div></div>
        <div class="field"><label for="ex">Explanation (shown after the quiz)</label><input id="ex" name="explanation"></div>
        <p class="err" id="adderr"></p>
        <button class="btn btn-primary" type="submit">Save question</button></form>`;
    } else if (tab === 'ai') {
      body = `<p class="muted">${ov.aiEnabled ? 'Describe a topic and Claude writes questions you can review before saving.' : 'AI is off. Add ANTHROPIC_API_KEY to your environment variables to turn it on.'}</p>
        <form data-form="gen" class="cols" novalidate>
          <div class="field"><label for="gt">Topic</label><input id="gt" name="topic" placeholder="e.g. SQL joins" required></div>
          <div class="field"><label for="gc">How many</label><select id="gc" name="count"><option>3</option><option selected>5</option><option>8</option><option>10</option></select></div>
          <div class="field"><label for="gd">Difficulty</label><select id="gd" name="difficulty"><option value="1">Easy</option><option value="2" selected>Medium</option><option value="3">Hard</option></select></div>
          <div><button class="btn btn-pencil" type="submit" ${ov.aiEnabled ? '' : 'disabled'}>Generate questions</button></div>
        </form>
        ${state.aiPreview.length ? `<h3 class="mt">Review before saving</h3>
          ${state.aiPreview.map((q) => `<div class="q-item"><div><b>${esc(q.text)}</b><br><small>${q.options.map((o, i) => (i === q.answer ? `<u>${esc(o)}</u>` : esc(o))).join(' / ')}</small></div></div>`).join('')}
          <p><button class="btn btn-primary" data-action="save-ai">Save all ${state.aiPreview.length} questions</button></p>` : ''}`;
    } else {
      body = `<p class="muted">Paste a JSON array. Each item: category, text, options (array), answer (index starting at 0), difficulty (1 to 3), explanation.</p>
        <form data-form="import" novalidate>
          <div class="field"><label for="js">JSON</label><textarea id="js" name="json" placeholder='[{"category":"Python","text":"...","options":["a","b"],"answer":0}]'></textarea></div>
          <button class="btn btn-primary" type="submit">Import questions</button></form>`;
    }

    $app.innerHTML = `
      <h1>Admin</h1>
      <div class="stats">
        <div class="stat"><b>${ov.questions}</b><span>Questions</span></div>
        <div class="stat"><b>${ov.users}</b><span>Users</span></div>
        <div class="stat"><b>${ov.attempts}</b><span>Quizzes taken</span></div>
      </div>
      <div class="tabs seg" role="group">${tabBtn('questions', 'Questions')}${tabBtn('add', 'Add one')}${tabBtn('ai', 'AI generate')}${tabBtn('import', 'Import JSON')}</div>
      <div class="sheet">${body}</div>`;
  }

  /* ---------- router ---------- */
  const routes = {
    '/login': authView, '/': homeView, '/quiz': quizView, '/result': resultView,
    '/dashboard': dashView, '/leaderboard': boardView, '/admin': adminView,
  };

  async function route() {
    clearInterval(timer);
    const path = location.hash.slice(1) || '/';
    if (store.token && !state.user) {
      try { state.user = (await api('/auth/me')).user; } catch { store.token = null; }
    }
    if (!state.user && path !== '/login') { location.hash = '#/login'; return; }
    if (state.user && path === '/login') { location.hash = '#/'; return; }
    renderNav();
    window.scrollTo(0, 0);
    try {
      await (routes[path] || homeView)();
    } catch (e) {
      toast(e.message, true);
    }
    applyBars();
  }
  window.addEventListener('hashchange', route);

  /* ---------- events ---------- */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    try {
      if (a === 'logout') { store.token = null; state.user = null; state.quiz = null; location.hash = '#/login'; renderNav(); }
      else if (a === 'toggle-auth') { state.authMode = state.authMode === 'login' ? 'register' : 'login'; authView(); }
      else if (a === 'set-mode') { state.mode = el.dataset.v; homeView(); }
      else if (a === 'set-count') { state.count = Number(el.dataset.v); homeView(); }
      else if (a === 'start') { el.disabled = true; await startQuiz(el.dataset.cat); }
      else if (a === 'pick') { answer(state.quiz.questions[state.quiz.idx].options[Number(el.dataset.i)], el); }
      else if (a === 'skip') { answer(null, null); }
      else if (a === 'admin-tab') { state.adminTab = el.dataset.v; adminView(); }
      else if (a === 'del-q') {
        if (confirm('Delete this question? Past results that used it will also be removed.')) {
          await api('/admin/questions/' + el.dataset.id, { method: 'DELETE' });
          toast('Question deleted.'); adminView();
        }
      } else if (a === 'save-ai') {
        const r = await api('/admin/questions/bulk', { method: 'POST', body: { questions: state.aiPreview } });
        state.aiPreview = []; state.adminTab = 'questions';
        toast(`Saved ${r.saved} questions.`); adminView();
      }
    } catch (err) {
      el.disabled = false;
      toast(err.message, true);
    }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button[type=submit]');
    if (btn) btn.disabled = true;
    try {
      if (form.dataset.form === 'auth') {
        const reg = state.authMode === 'register';
        const data = await api(reg ? '/auth/register' : '/auth/login', { method: 'POST', body: f });
        store.token = data.token; state.user = data.user;
        location.hash = '#/';
      } else if (form.dataset.form === 'add-q') {
        const raw = [0, 1, 2, 3].map((i) => (f['opt' + i] || '').trim());
        const picked = Number(f.correct);
        if (!raw[picked]) throw new Error('The option marked correct is empty.');
        const options = raw.filter(Boolean);
        const answerIdx = raw.slice(0, picked + 1).filter(Boolean).length - 1;
        await api('/admin/questions', { method: 'POST', body: { category: f.category, difficulty: f.difficulty, text: f.text, options, answer: answerIdx, explanation: f.explanation } });
        toast('Question saved.'); adminView();
      } else if (form.dataset.form === 'gen') {
        toast('Generating... this takes a few seconds.');
        state.aiPreview = (await api('/admin/generate', { method: 'POST', body: f })).questions;
        adminView();
      } else if (form.dataset.form === 'import') {
        let list;
        try { list = JSON.parse(f.json); } catch { throw new Error('That is not valid JSON.'); }
        if (!Array.isArray(list)) throw new Error('JSON must be an array of questions.');
        const r = await api('/admin/questions/bulk', { method: 'POST', body: { questions: list } });
        toast(`Imported ${r.saved}. Skipped ${r.skipped}.`, r.saved === 0); state.adminTab = 'questions'; adminView();
      }
    } catch (err) {
      const box = document.getElementById('autherr') || document.getElementById('adderr');
      if (box) box.textContent = err.message; else toast(err.message, true);
      if (btn) btn.disabled = false;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (location.hash !== '#/quiz' || !state.quiz || e.target.closest('input,textarea,select') || e.ctrlKey || e.metaKey) return;
    if (e.key.length !== 1) return;
    const i = LETTERS.toLowerCase().indexOf(e.key.toLowerCase());
    const item = state.quiz.questions[state.quiz.idx];
    if (i >= 0 && item && i < item.options.length) {
      answer(item.options[i], document.querySelectorAll('.opt')[i]);
    }
  });

  route();
})();

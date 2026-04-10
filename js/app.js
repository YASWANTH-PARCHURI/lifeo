/* app.js — LifeO main application */

/* ── STATE ── */
let currentPage = 'home';
let qcOpen = false;
let qcRouteTimeout = null;
let aiStatusEl = null;

const DAYS = ['S','M','T','W','T','F','S'];
const TODAY = today();

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }
  renderAll();
  showPage('home');
  bindNav();
  bindQC();
  updateAIStatus();
});

/* ── RENDER ALL ── */
function renderAll() {
  renderHome();
  renderFood();
  renderExercise();
  renderPlanner();
  renderGoals();
  renderProjects();
  renderSettings();
  renderWater();
}

/* ── NAV ── */
function bindNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => showPage(el.dataset.page));
  });
  document.querySelector('.nav-plus').addEventListener('click', () => openQC('auto'));
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${name}"]`)?.classList.add('active');
  currentPage = name;
  if (name === 'home') renderHome();
  if (name === 'food') { renderFood(); renderWater(); }
  if (name === 'exercise') renderExercise();
  if (name === 'planner') renderPlanner();
  if (name === 'goals') renderGoals();
  if (name === 'projects') renderProjects();
}

/* ── HOME DASHBOARD ── */
function renderHome() {
  const stats = DB.getDayStats(TODAY);
  const s = DB.getSettings();

  /* calorie balance */
  const diff = stats.net - stats.calGoal;
  const absDiff = Math.abs(diff);
  const netEl = document.getElementById('h-net');
  const netStatus = document.getElementById('h-net-status');
  if (netEl) {
    netEl.textContent = (diff > 0 ? '+' : '−') + absDiff;
    netEl.className = 'cal-big ' + (diff > 100 ? 'over' : diff < -100 ? 'under' : 'good');
    netStatus.textContent = diff > 100 ? 'kcal above goal' : diff < -100 ? 'kcal below goal' : 'On target 🎯';
  }
  setText('h-intake', stats.intake);
  setText('h-burned', stats.burned);
  setText('h-net2', stats.net);
  setText('h-goal', s.calGoal);

  /* tasks */
  const done = stats.tasksDone, total = stats.tasksTotal;
  setText('h-tasks-val', `${done}`);
  setText('h-tasks-of', `/${total || 0}`);
  setText('h-tasks-note', `${Math.max(0, total - done)} remaining today`);
  setBar('h-tasks-bar', total ? Math.round((done / total) * 100) : 0, 'var(--blue)');

  /* streak */
  const streak = DB.getExerciseStreak();
  setText('h-streak-val', streak);
  setText('h-streak-note', streak ? `${streak}-day streak` : 'No streak yet');
  setBar('h-streak-bar', Math.min(streak * 10, 100), 'var(--teal)');

  /* goals */
  const goals = DB.getGoals();
  const topGoal = goals[0];
  if (topGoal) {
    setText('h-goal-val', topGoal.pct + '%');
    setText('h-goal-note', topGoal.name.slice(0, 22) + '…');
    setBar('h-goal-bar', topGoal.pct, topGoal.color || 'var(--accent)');
  }

  /* week bars */
  renderWeekBars('h-week-bars', DB.getWeekCalories(), 'var(--amber)');
  const weekCals = DB.getWeekCalories();
  const avg = weekCals.filter(v => v > 0);
  setText('h-week-avg', avg.length ? Math.round(avg.reduce((a,b) => a+b,0) / avg.length) + ' avg/day' : 'No data yet');

  /* tasks preview */
  renderTaskPreview();
}

function renderTaskPreview() {
  const tasks = DB.getTasksForDate(TODAY).slice(0, 5);
  const el = document.getElementById('h-tasks-preview');
  if (!el) return;
  if (!tasks.length) {
    el.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--text3);font-size:13px;">No tasks today — add one ↓</div>';
    return;
  }
  el.innerHTML = tasks.map(t => `
    <div class="task-item" onclick="toggleTask(${t.id}, this)">
      <div class="task-cb ${t.done ? 'done' : ''}">${t.done ? '✓' : ''}</div>
      <div class="task-body">
        <div class="task-text ${t.done ? 'done' : ''}">${esc(t.text)}</div>
        <div class="task-meta">${t.priority === 'high' ? '🔴 High · ' : ''}Today</div>
      </div>
    </div>
  `).join('');
}

/* ── FOOD PAGE ── */
function renderFood() {
  const food = DB.getFoodForDate(TODAY);
  const s = DB.getSettings();
  const totalCal = food.reduce((a, f) => a + (f.cal || 0), 0);
  const totalP = food.reduce((a, f) => a + (f.protein || 0), 0);
  const totalC = food.reduce((a, f) => a + (f.carbs || 0), 0);
  const totalF = food.reduce((a, f) => a + (f.fat || 0), 0);
  const pct = Math.min(Math.round((totalCal / s.calGoal) * 100), 100);
  const over = totalCal > s.calGoal;

  setText('f-cal', totalCal.toLocaleString());
  setText('f-goal', s.calGoal.toLocaleString());
  setText('f-diff', (over ? '+' : '') + (totalCal - s.calGoal));
  document.getElementById('f-diff')?.classList.toggle('t-coral', over);
  document.getElementById('f-diff')?.classList.toggle('t-teal', !over);
  setText('f-p', totalP + 'g');
  setText('f-c', totalC + 'g');
  setText('f-fat', totalF + 'g');
  setBar('f-cal-bar', pct, over ? 'var(--coral)' : 'var(--teal)');

  const meals = { breakfast: [], lunch: [], dinner: [], snack: [], other: [] };
  food.forEach(f => (meals[f.meal] || meals.other).push(f));
  ['breakfast','lunch','dinner','snack'].forEach(m => {
    const el = document.getElementById('f-' + m);
    if (!el) return;
    const items = meals[m];
    if (!items.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:6px 0 0;text-align:center;">Nothing logged</div>';
      return;
    }
    el.innerHTML = items.map(f => `
      <div class="food-row">
        <div><div class="food-name">${esc(f.name)}</div><div class="food-macro">P:${f.protein}g · C:${f.carbs}g · F:${f.fat}g</div></div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="food-cal">${f.cal}</div>
          <button onclick="deleteFood(${f.id})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:15px;padding:2px;">×</button>
        </div>
      </div>
    `).join('');
  });
}

/* ── EXERCISE PAGE ── */
function renderExercise() {
  const ex = DB.getExerciseForDate(TODAY);
  const totalBurned = ex.reduce((a, e) => a + (e.calBurned || 0), 0);
  const streak = DB.getExerciseStreak();

  setText('ex-burned', totalBurned);
  setText('ex-streak', streak);

  const el = document.getElementById('ex-list');
  if (el) {
    if (!ex.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0;text-align:center;">No workouts logged today</div>';
    } else {
      el.innerHTML = ex.map(e => `
        <div class="ex-row">
          <div><div class="ex-name">${esc(e.name)}</div><div class="ex-detail">${esc(e.detail)}</div></div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="ex-cal">${e.calBurned} kcal</div>
            <button onclick="deleteExercise(${e.id})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:15px;padding:2px;">×</button>
          </div>
        </div>
      `).join('');
    }
  }

  /* streak dots */
  const streakEl = document.getElementById('ex-streak-dots');
  if (streakEl) {
    const dots = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const dayLetter = DAYS[d.getDay()];
      const hasEx = DB.getExerciseForDate(ds).length > 0;
      const isToday = ds === TODAY;
      const cls = isToday ? 'today' : hasEx ? 'done' : 'miss';
      dots.push(`<div class="sdot ${cls}">${dayLetter}</div>`);
    }
    streakEl.innerHTML = dots.join('');
  }

  renderWeekBars('ex-week-bars', DB.getWeekExercise(), 'var(--teal)');
  const weekEx = DB.getWeekExercise();
  setText('ex-week-total', weekEx.reduce((a,b) => a+b,0) + ' kcal burned this week');
}

/* ── PLANNER PAGE ── */
function renderPlanner() {
  const tasks = DB.getTasksForDate(TODAY);
  const done = tasks.filter(t => t.done).length;

  setText('pl-done', done);
  setText('pl-total', tasks.length);
  setText('pl-remain', Math.max(0, tasks.length - done));
  setBar('pl-bar', tasks.length ? Math.round((done / tasks.length) * 100) : 0, 'var(--blue)');

  const el = document.getElementById('pl-tasks');
  if (!el) return;
  if (!tasks.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:16px 0;text-align:center;">No tasks yet — use Quick Capture to add one</div>';
    return;
  }
  const high = tasks.filter(t => t.priority === 'high');
  const normal = tasks.filter(t => t.priority !== 'high');
  const render = arr => arr.map(t => `
    <div class="task-item" onclick="toggleTask(${t.id}, this)">
      <div class="task-cb ${t.done ? 'done' : ''}">${t.done ? '✓' : ''}</div>
      <div class="task-body">
        <div class="task-text ${t.done ? 'done' : ''}">${esc(t.text)}</div>
        <div class="task-meta">${t.priority === 'high' ? '🔴 High priority' : 'Today'}</div>
      </div>
      <div class="task-actions">
        <button class="task-del" onclick="event.stopPropagation();deleteTask(${t.id})">×</button>
      </div>
    </div>
  `).join('');
  el.innerHTML = (high.length ? '<div style="font-size:11px;color:var(--coral);font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Priority</div>' + render(high) + '<div style="height:8px;"></div>' : '') + render(normal);
}

/* ── GOALS PAGE ── */
function renderGoals() {
  const goals = DB.getGoals();
  const el = document.getElementById('goals-list');
  if (!el) return;
  el.innerHTML = goals.map(g => `
    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div>
          <div style="font-size:15px;font-weight:500;margin-bottom:6px;">${esc(g.name)}</div>
          <span class="tag t-gray">${esc(g.tag)}</span>
        </div>
        <div style="font-family:'Syne',sans-serif;font-size:24px;font-weight:700;color:${g.color || 'var(--accent2)'};">${g.pct}%</div>
      </div>
      <div class="gbar"><div class="gbar-fill" style="width:${g.pct}%;background:${g.color || 'var(--accent)'};"></div></div>
      <div class="goal-note" style="margin-top:8px;">${esc(g.note || '')}</div>
    </div>
  `).join('');
}

/* ── PROJECTS PAGE ── */
function renderProjects() {
  const projects = DB.getProjects();
  const sections = [
    { key: 'thisweek', label: 'This week', dotColor: 'var(--coral)' },
    { key: 'inprogress', label: 'In progress', dotColor: 'var(--amber)' },
    { key: 'planned', label: 'Planned', dotColor: 'var(--blue)' },
  ];
  const el = document.getElementById('projects-list');
  if (!el) return;
  el.innerHTML = sections.map(s => {
    const items = projects.filter(p => p.status === s.key);
    if (!items.length) return '';
    return `
      <div class="k-section">
        <div class="k-section-title"><div class="k-dot" style="background:${s.dotColor}"></div>${s.label}</div>
        ${items.map(p => `
          <div class="k-card">
            <div class="k-task">${esc(p.name)}</div>
            <div class="k-meta">
              <span class="tag ${p.tagClass || 't-gray'}">${esc(p.tag)}</span>
              <div class="k-date">${esc(p.date)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

/* ── SETTINGS PAGE ── */
function renderSettings() {
  const s = DB.getSettings();
  const nameEl = document.getElementById('s-name');
  const calEl = document.getElementById('s-cal-goal');
  const keyEl = document.getElementById('s-api-key');
  const aiEl = document.getElementById('s-ai-toggle');
  if (nameEl) nameEl.value = s.name || '';
  if (calEl) calEl.value = s.calGoal || 1500;
  if (keyEl) keyEl.value = s.apiKey || '';
  const waterEl = document.getElementById('s-water-goal');
  if (waterEl) waterEl.value = s.waterGoal || 8;
  if (aiEl) {
    aiEl.classList.toggle('on', !!s.aiEnabled);
    aiEl.dataset.on = s.aiEnabled ? '1' : '0';
  }
  updateAIStatus();
}

function saveSettings() {
  const s = DB.getSettings();
  const name = document.getElementById('s-name')?.value.trim();
  const cal = parseInt(document.getElementById('s-cal-goal')?.value) || 1500;
  const key = document.getElementById('s-api-key')?.value.trim();
  const aiOn = document.getElementById('s-ai-toggle')?.dataset.on === '1';
  const waterGoal = parseInt(document.getElementById('s-water-goal')?.value) || 8;
  DB.saveSettings({ ...s, name: name || s.name, calGoal: cal, apiKey: key, aiEnabled: aiOn, waterGoal });
  updateAIStatus();
  toast('Settings saved');
  renderAll();
}

function toggleAI() {
  const el = document.getElementById('s-ai-toggle');
  if (!el) return;
  const newVal = el.dataset.on !== '1';
  el.dataset.on = newVal ? '1' : '0';
  el.classList.toggle('on', newVal);
}

function updateAIStatus() {
  const s = DB.getSettings();
  const dot = document.getElementById('ai-status-dot');
  const txt = document.getElementById('ai-status-txt');
  if (!dot || !txt) return;
  if (!s.apiKey) {
    dot.className = 'ai-dot'; txt.textContent = 'No API key — add yours in Settings';
  } else if (!s.aiEnabled) {
    dot.className = 'ai-dot'; txt.textContent = 'AI disabled';
  } else {
    dot.className = 'ai-dot ready'; txt.textContent = 'AI ready — smart routing + photo calories active';
  }
}

/* ── TASK ACTIONS ── */
function toggleTask(id, el) {
  const t = DB.toggleTask(id);
  if (!t) return;
  const cb = el.querySelector('.task-cb');
  const txt = el.querySelector('.task-text');
  if (cb) { cb.classList.toggle('done', t.done); cb.textContent = t.done ? '✓' : ''; }
  if (txt) txt.classList.toggle('done', t.done);
  refreshCounters();
}

function deleteTask(id) {
  DB.deleteTask(id);
  renderPlanner();
  renderHome();
  toast('Task deleted');
}

function deleteFood(id) {
  const food = DB.getFood().filter(f => f.id !== id);
  DB._set('lifeo_food', food);
  renderFood();
  renderHome();
  toast('Entry removed');
}

function deleteExercise(id) {
  const ex = DB.getExercise().filter(e => e.id !== id);
  DB._set('lifeo_exercise', ex);
  renderExercise();
  renderHome();
  toast('Entry removed');
}

function refreshCounters() {
  const tasks = DB.getTasksForDate(TODAY);
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  setText('h-tasks-val', done);
  setText('h-tasks-of', `/${total}`);
  setText('h-tasks-note', `${Math.max(0,total-done)} remaining today`);
  setBar('h-tasks-bar', total ? Math.round((done/total)*100) : 0, 'var(--blue)');
  setText('pl-done', done);
  setText('pl-total', total);
  setText('pl-remain', Math.max(0, total-done));
  setBar('pl-bar', total ? Math.round((done/total)*100) : 0, 'var(--blue)');
}

/* ── QUICK CAPTURE ── */
function bindQC() {
  const overlay = document.getElementById('qc-overlay');
  const input = document.getElementById('qc-input');
  overlay.addEventListener('click', e => { if (e.target === overlay) closeQC(); });
  input.addEventListener('input', e => {
    clearTimeout(qcRouteTimeout);
    qcRouteTimeout = setTimeout(() => previewRoute(e.target.value), 350);
  });
  document.getElementById('qc-save').addEventListener('click', saveCapture);
  document.getElementById('qc-photo').addEventListener('click', () => document.getElementById('qc-img').click());
  document.getElementById('qc-img').addEventListener('change', handlePhoto);
  document.querySelectorAll('.qc-chip').forEach(c => {
    c.addEventListener('click', () => { input.value = c.dataset.ex; previewRoute(c.dataset.ex); input.focus(); });
  });
}

function openQC(hint) {
  document.getElementById('qc-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('qc-input').focus(), 100);
  qcOpen = true;
}

function closeQC() {
  document.getElementById('qc-overlay').classList.add('hidden');
  document.getElementById('qc-input').value = '';
  document.getElementById('qc-route-hint').innerHTML = '';
  document.getElementById('qc-save').disabled = false;
  qcOpen = false;
}

async function previewRoute(val) {
  const hint = document.getElementById('qc-route-hint');
  if (!val.trim()) { hint.innerHTML = ''; return; }
  const moduleColors = { exercise: 'var(--teal)', food: 'var(--amber)', task: 'var(--blue)', goal: 'var(--accent2)', project: 'var(--coral)' };
  if (AI.enabled) {
    hint.innerHTML = '<span style="color:var(--text3)">AI routing…</span>';
    const result = await AI.routeCapture(val).catch(() => fallbackRoute(val));
    const col = moduleColors[result.module] || 'var(--accent2)';
    hint.innerHTML = `→ <b style="color:${col}">${result.module}</b> <span style="color:var(--text3);font-size:11px;">${result.display || ''}</span>`;
  } else {
    const result = fallbackRoute(val);
    const col = moduleColors[result.module] || 'var(--accent2)';
    hint.innerHTML = `→ <b style="color:${col}">${result.module}</b>`;
  }
}

async function saveCapture() {
  const input = document.getElementById('qc-input');
  const val = input.value.trim();
  if (!val) return;
  const btn = document.getElementById('qc-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    let result;
    if (AI.enabled) {
      result = await AI.routeCapture(val);
    } else {
      result = fallbackRoute(val);
      result.extracted = result.extracted || {};
    }

    const ex = result.extracted || {};

    if (result.module === 'exercise') {
      DB.addExercise({ name: ex.name || val, detail: ex.detail || '', calBurned: ex.calBurned || 0 });
    } else if (result.module === 'food') {
      DB.addFood({ name: ex.name || val, cal: ex.cal || 0, protein: ex.protein || 0, carbs: ex.carbs || 0, fat: ex.fat || 0, meal: ex.meal || 'other' });
    } else if (result.module === 'goal') {
      /* goals are static in v1 — just show a toast */
    } else if (result.module === 'project') {
      /* projects are static in v1 */
    } else {
      DB.addTask({ text: ex.text || val, priority: ex.priority || 'normal', date: ex.date || TODAY });
    }

    closeQC();
    renderAll();
    toast(result.display || 'Saved ✓');
  } catch(e) {
    /* fallback: add as task */
    DB.addTask({ text: val, priority: 'normal', date: TODAY });
    closeQC();
    renderAll();
    toast('Saved as task');
  }
}

/* ── FOOD PHOTO ── */
async function handlePhoto(input) {
  if (!input.files?.[0]) return;
  const file = input.files[0];
  const mimeType = file.type || 'image/jpeg';

  const qcInput = document.getElementById('qc-input');
  const hint = document.getElementById('qc-route-hint');
  hint.innerHTML = '<span style="color:var(--amber)">Analyzing photo…</span>';
  qcInput.value = 'Analyzing food photo…';
  qcInput.disabled = true;

  try {
    const base64 = await fileToBase64(file);
    if (!AI.enabled) throw new Error('No API key');
    const result = await AI.estimateFoodPhoto(base64, mimeType);
    qcInput.value = `${result.name} — ~${result.cal} cal`;
    qcInput.disabled = false;
    hint.innerHTML = `→ <b style="color:var(--amber)">Food</b> · ${result.note || result.confidence + ' confidence'}`;
    document.getElementById('qc-save').onclick = async () => {
      DB.addFood({ name: result.name, cal: result.cal, protein: result.protein || 0, carbs: result.carbs || 0, fat: result.fat || 0, meal: result.meal || 'other' });
      closeQC();
      renderAll();
      toast(`Added: ${result.name} · ${result.cal} kcal`);
    };
  } catch(e) {
    qcInput.value = '';
    qcInput.disabled = false;
    hint.innerHTML = '<span style="color:var(--coral)">Could not analyze — enter manually</span>';
    if (!AI.enabled) toast('Add Claude API key in Settings for photo calories');
  }
  input.value = '';
}

/* ── ADD MODALS ── */
function openAddTask() {
  showModal(`
    <div class="modal-title">Add task</div>
    <div class="field"><label>Task</label><input id="m-task-text" type="text" placeholder="What needs doing?" autocomplete="off"></div>
    <div class="field"><label>Priority</label>
      <select id="m-task-pri"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select>
    </div>
    <div class="modal-btns">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitTask()">Add task</button>
    </div>
  `);
  document.getElementById('m-task-text')?.focus();
}

function submitTask() {
  const text = document.getElementById('m-task-text')?.value.trim();
  const priority = document.getElementById('m-task-pri')?.value || 'normal';
  if (!text) return;
  DB.addTask({ text, priority, date: TODAY });
  closeModal();
  renderPlanner();
  renderHome();
  toast('Task added');
}

function openAddFood(meal) {
  const examples = {
    breakfast: '2 idli with sambar, glass of milk',
    lunch: '250g rice with dal and sabzi',
    dinner: '3 chapati with paneer curry',
    snack: '2 tbsp peanut butter, banana',
    other: 'glass of milk, handful of nuts',
  };
  const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);
  showModal(`
    <div class="modal-title">Log ${mealLabel}</div>
    <div class="field">
      <label>What did you eat? Describe it naturally</label>
      <textarea id="m-food-desc" placeholder="e.g. ${examples[meal]||examples.other}" rows="3" style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r-sm);color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;padding:11px 13px;outline:none;resize:none;line-height:1.5;transition:border-color 0.15s;"></textarea>
    </div>
    <div id="m-food-estimating" style="display:none;text-align:center;padding:10px 0;font-size:13px;color:var(--text2);">Estimating calories…⏳</div>
    <div id="m-food-estimate" style="display:none;background:var(--bg3);border-radius:var(--r-sm);padding:12px;margin-bottom:4px;">
      <div style="font-size:10px;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">AI Estimate</div>
      <div style="display:flex;gap:16px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px;">
        <div><span style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700;color:var(--amber);" id="m-est-cal">—</span><span style="font-size:11px;color:var(--text3);margin-left:3px;">kcal</span></div>
        <div><span style="font-size:13px;font-weight:600;" id="m-est-p">—</span><span style="font-size:11px;color:var(--text3);margin-left:2px;">P</span></div>
        <div><span style="font-size:13px;font-weight:600;" id="m-est-c">—</span><span style="font-size:11px;color:var(--text3);margin-left:2px;">C</span></div>
        <div><span style="font-size:13px;font-weight:600;" id="m-est-f">—</span><span style="font-size:11px;color:var(--text3);margin-left:2px;">F</span></div>
      </div>
      <div style="font-size:11px;color:var(--text3);" id="m-est-note"></div>
    </div>
    <div class="modal-btns">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-ghost" id="m-est-btn" onclick="estimateFoodFromText('${meal}')">Estimate →</button>
      <button class="btn btn-primary" id="m-food-save-btn" onclick="submitFoodEstimate('${meal}')" style="opacity:0.5;pointer-events:none;">Save</button>
    </div>
  `);
  const ta = document.getElementById('m-food-desc');
  ta?.focus();
  ta?.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();estimateFoodFromText(meal);} });
}

let _lastFoodEstimate = null;

async function estimateFoodFromText(meal) {
  const desc = document.getElementById('m-food-desc')?.value.trim();
  if (!desc) return;
  const estimatingEl = document.getElementById('m-food-estimating');
  const estimateEl = document.getElementById('m-food-estimate');
  const estBtn = document.getElementById('m-est-btn');
  const saveBtn = document.getElementById('m-food-save-btn');
  estimatingEl.style.display = 'block';
  estimateEl.style.display = 'none';
  estBtn.disabled = true;
  try {
    const result = await AI.estimateFoodText(desc, meal);
    _lastFoodEstimate = { ...result, meal, name: desc };
    document.getElementById('m-est-cal').textContent = result.cal;
    document.getElementById('m-est-p').textContent = result.protein + 'g';
    document.getElementById('m-est-c').textContent = result.carbs + 'g';
    document.getElementById('m-est-f').textContent = result.fat + 'g';
    document.getElementById('m-est-note').textContent = result.note || '';
    estimateEl.style.display = 'block';
    saveBtn.style.opacity = '1';
    saveBtn.style.pointerEvents = 'auto';
  } catch(e) {
    _lastFoodEstimate = null;
    estimatingEl.innerHTML = '<span style="color:var(--coral)">Add Claude API key in Settings for auto-estimation</span>';
    saveBtn.style.opacity = '1';
    saveBtn.style.pointerEvents = 'auto';
  }
  estimatingEl.style.display = 'none';
  estBtn.disabled = false;
}

function submitFoodEstimate(meal) {
  const desc = document.getElementById('m-food-desc')?.value.trim();
  if (!desc) return;
  if (_lastFoodEstimate) {
    DB.addFood({ name: desc, cal: _lastFoodEstimate.cal, protein: _lastFoodEstimate.protein, carbs: _lastFoodEstimate.carbs, fat: _lastFoodEstimate.fat, meal });
    toast(`Logged ${_lastFoodEstimate.cal} kcal`);
  } else {
    DB.addFood({ name: desc, cal: 0, protein: 0, carbs: 0, fat: 0, meal });
    toast('Saved — add API key for calorie estimates');
  }
  _lastFoodEstimate = null;
  closeModal();
  renderFood();
  renderHome();
}

/* ── WATER TRACKING ── */
function logWater(delta) {
  const key = 'lifeo_water_' + TODAY;
  const current = parseInt(localStorage.getItem(key) || '0');
  const next = Math.max(0, current + delta);
  localStorage.setItem(key, next);
  renderWater();
  if (delta > 0) toast('💧 +1 glass logged');
}

function getWaterToday() {
  return parseInt(localStorage.getItem('lifeo_water_' + TODAY) || '0');
}

function renderWater() {
  const s = DB.getSettings();
  const goal = s.waterGoal || 8;
  const current = getWaterToday();
  const pct = Math.min(Math.round((current / goal) * 100), 100);
  setText('w-current', current);
  setText('w-goal', goal);
  setBar('w-bar', pct, 'var(--blue)');
  const dots = document.getElementById('w-dots');
  if (dots) {
    dots.innerHTML = Array.from({length: Math.min(goal,12)}, (_, i) =>
      `<div onclick="logWater(${i < current ? -1 : 1})" style="width:30px;height:30px;border-radius:7px;background:${i < current ? 'rgba(74,158,255,0.75)' : 'var(--bg4)'};display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;transition:background 0.15s;">💧</div>`
    ).join('');
  }
}

function openAddExercise() {
  showModal(`
    <div class="modal-title">Log workout</div>
    <div class="field"><label>Exercise</label><input id="m-ex-name" type="text" placeholder="e.g. Morning run, Push-ups, Yoga" autocomplete="off"></div>
    <div class="field"><label>Details</label><input id="m-ex-detail" type="text" placeholder="e.g. 5km in 28 min / 3×20 reps" autocomplete="off"></div>
    <div class="field"><label>Calories burned</label><input id="m-ex-cal" type="number" placeholder="kcal" min="0"></div>
    <div class="modal-btns">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitExercise()">Add workout</button>
    </div>
  `);
  document.getElementById('m-ex-name')?.focus();
}

function submitExercise() {
  const name = document.getElementById('m-ex-name')?.value.trim();
  const detail = document.getElementById('m-ex-detail')?.value.trim();
  const calBurned = parseInt(document.getElementById('m-ex-cal')?.value) || 0;
  if (!name) return;
  DB.addExercise({ name, detail, calBurned });
  closeModal();
  renderExercise();
  renderHome();
  toast('Workout logged');
}

/* ── MODAL HELPERS ── */
function showModal(html) {
  let overlay = document.getElementById('modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.getElementById('app').appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.style.display = 'flex';
}

function closeModal() {
  const el = document.getElementById('modal-overlay');
  if (el) el.style.display = 'none';
}

/* ── UTILS ── */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setBar(id, pct, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = Math.min(pct, 100) + '%';
  if (color) el.style.background = color;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function renderWeekBars(id, values, color) {
  const el = document.getElementById(id);
  if (!el) return;
  const max = Math.max(...values, 1);
  const todayIdx = 6;
  el.innerHTML = values.map((v, i) => {
    const h = Math.round((v / max) * 100);
    const dayLabel = DAYS[(new Date(Date.now() - (6-i)*86400000)).getDay()];
    const isToday = i === todayIdx;
    return `<div class="wbar-wrap">
      <div class="wbar" style="height:${Math.max(h,4)}%;background:${v ? color : 'var(--bg4)'};opacity:${isToday?1:0.6};"></div>
      <div class="wday ${isToday?'today':''}">${dayLabel}</div>
    </div>`;
  }).join('');
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

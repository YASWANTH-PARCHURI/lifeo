/* db.js — localStorage persistence layer */
const DB_KEYS = {
  tasks: 'lifeo_tasks',
  food: 'lifeo_food',
  exercise: 'lifeo_exercise',
  goals: 'lifeo_goals',
  projects: 'lifeo_projects',
  settings: 'lifeo_settings',
};

const DB = {
  /* ── GENERIC ── */
  _get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  },
  _getObj(key, def = {}) {
    try { return JSON.parse(localStorage.getItem(key)) || def; }
    catch { return def; }
  },
  _set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.warn('Storage full', e); }
  },

  /* ── SETTINGS ── */
  getSettings() {
    return this._getObj(DB_KEYS.settings, {
      name: 'Yaswanth',
      calGoal: 1500,
      apiKey: '',
      ninjasKey: '',
      aiEnabled: true,
    });
  },
  saveSettings(s) { this._set(DB_KEYS.settings, s); },

  /* ── TASKS ── */
  getTasks() { return this._get(DB_KEYS.tasks); },
  saveTasks(tasks) { this._set(DB_KEYS.tasks, tasks); },
  addTask(task) {
    const tasks = this.getTasks();
    const t = { id: Date.now(), text: task.text, done: false, priority: task.priority || 'normal', date: task.date || today(), createdAt: Date.now() };
    tasks.unshift(t);
    this.saveTasks(tasks);
    return t;
  },
  toggleTask(id) {
    const tasks = this.getTasks();
    const t = tasks.find(t => t.id === id);
    if (t) { t.done = !t.done; t.doneAt = t.done ? Date.now() : null; }
    this.saveTasks(tasks);
    return t;
  },
  deleteTask(id) {
    const tasks = this.getTasks().filter(t => t.id !== id);
    this.saveTasks(tasks);
  },
  getTasksForDate(date) { return this.getTasks().filter(t => t.date === date); },

  /* ── FOOD ── */
  getFood() { return this._get(DB_KEYS.food); },
  addFood(item) {
    const food = this.getFood();
    const f = { id: Date.now(), name: item.name, cal: item.cal || 0, protein: item.protein || 0, carbs: item.carbs || 0, fat: item.fat || 0, meal: item.meal || 'other', date: item.date || today(), createdAt: Date.now() };
    food.unshift(f);
    this._set(DB_KEYS.food, food);
    return f;
  },
  getFoodForDate(date) { return this.getFood().filter(f => f.date === date); },

  /* ── EXERCISE ── */
  getExercise() { return this._get(DB_KEYS.exercise); },
  addExercise(item) {
    const ex = this.getExercise();
    const e = { id: Date.now(), name: item.name, detail: item.detail || '', calBurned: item.calBurned || 0, date: item.date || today(), createdAt: Date.now() };
    ex.unshift(e);
    this._set(DB_KEYS.exercise, ex);
    return e;
  },
  getExerciseForDate(date) { return this.getExercise().filter(e => e.date === date); },

  /* ── GOALS (static for v1, editable in settings) ── */
  getGoals() {
    const stored = this._get(DB_KEYS.goals);
    if (stored.length) return stored;
    const defaults = [
      { id: 1, name: 'Get fit by June 2025', pct: 68, tag: 'Health', color: 'var(--teal)', note: 'Run 10km without stopping' },
      { id: 2, name: 'Read 24 books in 2025', pct: 29, tag: 'Learning', color: 'var(--blue)', note: '7 of 24 done · On pace' },
      { id: 3, name: 'LinkedIn to 10k connections', pct: 23, tag: 'Career', color: 'var(--accent)', note: '2,300 → 10,000 · +180 this month' },
    ];
    this._set(DB_KEYS.goals, defaults);
    return defaults;
  },
  saveGoals(goals) { this._set(DB_KEYS.goals, goals); },

  /* ── PROJECTS (static for v1) ── */
  getProjects() {
    const stored = this._get(DB_KEYS.projects);
    if (stored.length) return stored;
    const defaults = [
      { id: 1, name: 'India Accelerator ecosystem report', status: 'thisweek', tag: 'Due today', tagClass: 't-coral', date: 'Apr 10' },
      { id: 2, name: "Founder's Office job applications", status: 'inprogress', tag: 'Ongoing', tagClass: 't-amber', date: 'Rolling' },
      { id: 3, name: 'LifeO app — PWA build', status: 'inprogress', tag: 'Building', tagClass: 't-purple', date: 'Apr 2025' },
      { id: 4, name: 'YC Startup School India prep', status: 'planned', tag: 'Apr 18', tagClass: 't-blue', date: 'Bangalore' },
      { id: 5, name: 'LinkedIn content calendar — May', status: 'planned', tag: 'Planned', tagClass: 't-blue', date: 'Apr 30' },
    ];
    this._set(DB_KEYS.projects, defaults);
    return defaults;
  },

  /* ── COMPUTED STATS ── */
  getDayStats(date) {
    const food = this.getFoodForDate(date);
    const ex = this.getExerciseForDate(date);
    const tasks = this.getTasksForDate(date);
    const settings = this.getSettings();
    const intake = food.reduce((s, f) => s + (f.cal || 0), 0);
    const burned = ex.reduce((s, e) => s + (e.calBurned || 0), 0);
    const net = intake - burned;
    const diff = net - settings.calGoal;
    return {
      intake, burned, net,
      calGoal: settings.calGoal,
      diff,
      tasksDone: tasks.filter(t => t.done).length,
      tasksTotal: tasks.length,
    };
  },

  getWeekCalories() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const food = this.getFoodForDate(ds);
      days.push(food.reduce((s, f) => s + (f.cal || 0), 0));
    }
    return days;
  },

  getWeekExercise() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const ex = this.getExerciseForDate(ds);
      days.push(ex.reduce((s, e) => s + (e.calBurned || 0), 0));
    }
    return days;
  },

  getExerciseStreak() {
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      if (this.getExerciseForDate(ds).length > 0) streak++;
      else if (i > 0) break;
    }
    return streak;
  },
};

function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(ds) {
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' });
}

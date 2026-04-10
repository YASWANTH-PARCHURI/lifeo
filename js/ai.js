/* ai.js — Claude API integration */

const AI = {
  get apiKey() { return DB.getSettings().apiKey || ''; },
  get enabled() { return DB.getSettings().aiEnabled && !!this.apiKey; },

  async call(messages, system, maxTokens = 400) {
    if (!this.apiKey) throw new Error('No API key');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: maxTokens,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text || '';
  },

  /* ── QUICK CAPTURE ROUTING ── */
  async routeCapture(text) {
    if (!this.enabled) return fallbackRoute(text);
    const system = `You are LifeO, a personal life OS. Given a user's quick capture input, extract structured data and route it to the correct module.

Respond ONLY with valid JSON in this exact format:
{
  "module": "exercise" | "food" | "task" | "goal" | "project",
  "confidence": 0.0-1.0,
  "extracted": {
    // For exercise: { "name": string, "detail": string, "calBurned": number }
    // For food: { "name": string, "meal": "breakfast"|"lunch"|"dinner"|"snack"|"other", "cal": number, "protein": number, "carbs": number, "fat": number }
    // For task: { "text": string, "priority": "high"|"normal"|"low", "date": "YYYY-MM-DD" }
    // For goal: { "text": string }
    // For project: { "text": string }
  },
  "display": "short human-friendly confirmation string"
}

Today's date: ${today()}. Estimate calories/macros from Indian food knowledge if not given. Be generous with calorie estimates.`;

    try {
      const raw = await this.call([{ role: 'user', content: text }], system, 300);
      const json = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(json);
    } catch(e) {
      console.warn('AI route failed, using fallback', e);
      return fallbackRoute(text);
    }
  },

  /* ── FOOD TEXT ESTIMATION — API Ninjas first, fallback to Indian DB ── */
  async estimateFoodText(description, meal) {
    const ninjasKey = DB.getSettings().ninjasKey || '';
    if (ninjasKey) {
      try {
        const result = await callNinjasAPI(description, ninjasKey);
        if (result) return result;
      } catch(e) {
        console.warn('API Ninjas failed, using fallback', e);
      }
    }
    return fallbackFoodEstimate(description);
  },

  /* ── FOOD PHOTO CALORIE ESTIMATION ── */
  async estimateFoodPhoto(base64, mimeType) {
    if (!this.enabled) throw new Error('AI not configured');
    const system = `You are a nutrition expert and Indian food specialist. Analyze the food in the image and estimate calories and macros.

Respond ONLY with valid JSON:
{
  "name": "descriptive food name",
  "meal": "breakfast"|"lunch"|"dinner"|"snack"|"other",
  "cal": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "confidence": "high"|"medium"|"low",
  "note": "brief note about the estimate"
}

Be specific about the food. If multiple items, describe the main ones. Use realistic portion estimates for one person. Include typical Indian recipes in your knowledge.`;

    const raw = await this.call([{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: 'Estimate the calories and macros for this food.' }
      ]
    }], system, 300);

    const json = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(json);
  },
};

/* ── API NINJAS FOOD LOOKUP ── */
async function callNinjasAPI(description, key) {
  const query = encodeURIComponent(description);
  const res = await fetch(`https://api.api-ninjas.com/v1/nutrition?query=${query}`, {
    headers: { 'X-Api-Key': key }
  });
  if (!res.ok) throw new Error('API Ninjas error ' + res.status);
  const items = await res.json();
  if (!items || !items.length) return null;

  // Sum all items returned (e.g. "rice + dal" returns 2 items)
  const total = items.reduce((acc, item) => ({
    cal:     acc.cal     + Math.round(item.calories      || 0),
    protein: acc.protein + Math.round(item.protein_g     || 0),
    carbs:   acc.carbs   + Math.round(item.carbohydrates_total_g || 0),
    fat:     acc.fat     + Math.round(item.fat_total_g   || 0),
  }), { cal: 0, protein: 0, carbs: 0, fat: 0 });

  const names = items.map(i => i.name).join(' + ');
  return { ...total, note: `Via API Ninjas: ${names}` };
}

/* ── FALLBACK ROUTING (no API key needed) ── */
function fallbackRoute(text) {
  const t = text.toLowerCase();
  const rules = [
    { keywords: ['ran','run','jog','walk','gym','pushup','push-up','squat','workout','exercise','km','kilometres','sets','reps','cycling','swim','yoga','hiit','cardio','lift'], module: 'exercise' },
    { keywords: ['ate','eat','lunch','dinner','breakfast','snack','cal','calorie','food','drank','coffee','tea','rice','roti','dal','biryani','pizza','burger','noodles','curry','chapati','idli','dosa','paratha','sabzi','paneer','chicken','egg'], module: 'food' },
    { keywords: ['project','build','launch','ship','deck','report','pitch','mvp','develop','deploy'], module: 'project' },
    { keywords: ['goal','target','achieve','milestone','habit'], module: 'goal' },
  ];
  for (const r of rules) {
    if (r.keywords.some(k => t.includes(k))) {
      return { module: r.module, confidence: 0.8, extracted: { text, name: text }, display: `→ ${r.module}` };
    }
  }
  return { module: 'task', confidence: 0.6, extracted: { text, priority: 'normal', date: today() }, display: '→ task (planner)' };
}

/* ── FALLBACK FOOD ESTIMATE (no API) ── */
const FOOD_DB = [
  /* Indian staples */
  { words: ['rice','dal','sabzi','curry'],       cal: 480, protein: 14, carbs: 82, fat: 9  },
  { words: ['chapati','sabzi'],                   cal: 320, protein: 9,  carbs: 56, fat: 7  },
  { words: ['roti','sabzi'],                      cal: 320, protein: 9,  carbs: 56, fat: 7  },
  { words: ['chapati','dal'],                     cal: 350, protein: 12, carbs: 58, fat: 7  },
  { words: ['paratha'],                           cal: 260, protein: 6,  carbs: 38, fat: 10 },
  { words: ['aloo paratha'],                      cal: 300, protein: 7,  carbs: 44, fat: 11 },
  { words: ['poha'],                              cal: 250, protein: 5,  carbs: 45, fat: 6  },
  { words: ['upma'],                              cal: 220, protein: 5,  carbs: 38, fat: 5  },
  { words: ['idli','sambar'],                     cal: 230, protein: 8,  carbs: 42, fat: 3  },
  { words: ['idli'],                              cal: 150, protein: 5,  carbs: 28, fat: 1  },
  { words: ['dosa','sambar'],                     cal: 280, protein: 7,  carbs: 45, fat: 8  },
  { words: ['dosa'],                              cal: 180, protein: 4,  carbs: 30, fat: 6  },
  { words: ['dal','rice'],                        cal: 420, protein: 14, carbs: 72, fat: 7  },
  { words: ['dal'],                               cal: 180, protein: 10, carbs: 28, fat: 3  },
  { words: ['biryani'],                           cal: 520, protein: 18, carbs: 72, fat: 16 },
  { words: ['paneer','curry'],                    cal: 380, protein: 18, carbs: 14, fat: 26 },
  { words: ['paneer'],                            cal: 265, protein: 14, carbs: 4,  fat: 22 },
  { words: ['chicken','curry'],                   cal: 320, protein: 28, carbs: 8,  fat: 18 },
  { words: ['chicken','rice'],                    cal: 480, protein: 32, carbs: 55, fat: 12 },
  { words: ['chicken'],                           cal: 240, protein: 28, carbs: 2,  fat: 13 },
  { words: ['egg','rice'],                        cal: 380, protein: 16, carbs: 58, fat: 9  },
  { words: ['egg','curry'],                       cal: 280, protein: 14, carbs: 8,  fat: 20 },
  { words: ['boiled egg'],                        cal: 78,  protein: 6,  carbs: 1,  fat: 5  },
  { words: ['scrambled egg'],                     cal: 160, protein: 11, carbs: 2,  fat: 12 },
  { words: ['egg'],                               cal: 78,  protein: 6,  carbs: 1,  fat: 5  },
  { words: ['sambar'],                            cal: 80,  protein: 4,  carbs: 12, fat: 2  },
  { words: ['curd','rice'],                       cal: 300, protein: 8,  carbs: 52, fat: 5  },
  { words: ['curd'],                              cal: 100, protein: 6,  carbs: 8,  fat: 4  },
  { words: ['raita'],                             cal: 80,  protein: 4,  carbs: 8,  fat: 3  },
  /* Breakfast */
  { words: ['oats','peanut butter','milk'],       cal: 420, protein: 16, carbs: 52, fat: 16 },
  { words: ['oats','banana','milk'],              cal: 350, protein: 10, carbs: 62, fat: 6  },
  { words: ['oats','milk'],                       cal: 280, protein: 10, carbs: 44, fat: 7  },
  { words: ['oats','water'],                      cal: 160, protein: 6,  carbs: 28, fat: 3  },
  { words: ['oats'],                              cal: 190, protein: 7,  carbs: 32, fat: 4  },
  { words: ['bread','egg'],                       cal: 280, protein: 14, carbs: 30, fat: 11 },
  { words: ['bread','butter'],                    cal: 220, protein: 5,  carbs: 28, fat: 10 },
  { words: ['bread','peanut butter'],             cal: 280, protein: 10, carbs: 32, fat: 12 },
  { words: ['bread','jam'],                       cal: 200, protein: 4,  carbs: 40, fat: 3  },
  { words: ['toast'],                             cal: 160, protein: 5,  carbs: 30, fat: 2  },
  { words: ['cornflakes','milk'],                 cal: 240, protein: 7,  carbs: 44, fat: 4  },
  { words: ['muesli','milk'],                     cal: 300, protein: 9,  carbs: 52, fat: 6  },
  /* Drinks */
  { words: ['glass of milk','full fat'],          cal: 150, protein: 8,  carbs: 12, fat: 8  },
  { words: ['glass of milk'],                     cal: 120, protein: 6,  carbs: 10, fat: 5  },
  { words: ['cup of milk'],                       cal: 120, protein: 6,  carbs: 10, fat: 5  },
  { words: ['milk'],                              cal: 120, protein: 6,  carbs: 10, fat: 5  },
  { words: ['chai','milk','sugar'],               cal: 80,  protein: 2,  carbs: 12, fat: 2  },
  { words: ['chai'],                              cal: 60,  protein: 2,  carbs: 8,  fat: 2  },
  { words: ['coffee','milk','sugar'],             cal: 60,  protein: 2,  carbs: 10, fat: 1  },
  { words: ['black coffee'],                      cal: 5,   protein: 0,  carbs: 1,  fat: 0  },
  { words: ['green tea'],                         cal: 5,   protein: 0,  carbs: 1,  fat: 0  },
  { words: ['tea'],                               cal: 35,  protein: 1,  carbs: 6,  fat: 1  },
  { words: ['coffee'],                            cal: 35,  protein: 1,  carbs: 5,  fat: 1  },
  { words: ['lassi'],                             cal: 180, protein: 6,  carbs: 28, fat: 5  },
  { words: ['buttermilk','chaas'],                cal: 50,  protein: 3,  carbs: 4,  fat: 2  },
  { words: ['juice'],                             cal: 120, protein: 1,  carbs: 28, fat: 0  },
  { words: ['protein shake'],                     cal: 220, protein: 24, carbs: 20, fat: 4  },
  /* Snacks */
  { words: ['peanut butter','2 tbsp'],            cal: 190, protein: 8,  carbs: 6,  fat: 16 },
  { words: ['peanut butter','1 tbsp'],            cal: 95,  protein: 4,  carbs: 3,  fat: 8  },
  { words: ['peanut butter'],                     cal: 190, protein: 8,  carbs: 6,  fat: 16 },
  { words: ['banana'],                            cal: 90,  protein: 1,  carbs: 23, fat: 0  },
  { words: ['apple'],                             cal: 80,  protein: 0,  carbs: 21, fat: 0  },
  { words: ['peanuts','handful'],                 cal: 160, protein: 7,  carbs: 5,  fat: 14 },
  { words: ['peanuts'],                           cal: 160, protein: 7,  carbs: 5,  fat: 14 },
  { words: ['almonds','handful'],                 cal: 170, protein: 6,  carbs: 6,  fat: 15 },
  { words: ['nuts'],                              cal: 170, protein: 5,  carbs: 6,  fat: 15 },
  { words: ['biscuit','marie'],                   cal: 120, protein: 2,  carbs: 22, fat: 3  },
  { words: ['biscuit'],                           cal: 150, protein: 2,  carbs: 24, fat: 5  },
  { words: ['samosa'],                            cal: 260, protein: 5,  carbs: 32, fat: 13 },
  { words: ['vada'],                              cal: 180, protein: 4,  carbs: 22, fat: 9  },
  { words: ['maggi','noodles'],                   cal: 350, protein: 8,  carbs: 52, fat: 12 },
  /* Fast food */
  { words: ['pizza','slice'],                     cal: 280, protein: 12, carbs: 34, fat: 10 },
  { words: ['pizza'],                             cal: 560, protein: 24, carbs: 68, fat: 20 },
  { words: ['burger'],                            cal: 450, protein: 20, carbs: 48, fat: 20 },
  { words: ['sandwich'],                          cal: 320, protein: 14, carbs: 38, fat: 10 },
  { words: ['pasta'],                             cal: 380, protein: 12, carbs: 62, fat: 8  },
  /* Sweets */
  { words: ['gulab jamun'],                       cal: 380, protein: 5,  carbs: 60, fat: 14 },
  { words: ['kheer'],                             cal: 280, protein: 7,  carbs: 42, fat: 9  },
  { words: ['halwa'],                             cal: 350, protein: 5,  carbs: 52, fat: 14 },
];

function extractQuantityMultiplier(text) {
  const t = text.toLowerCase();
  // detect leading numbers like "2 chapati", "3 idli", "250g"
  const countMatch = t.match(/^(\d+)\s*(chapati|roti|idli|egg|eggs|slice|piece|biscuit|samosa|banana|apple)/);
  if (countMatch) return parseInt(countMatch[1]);
  const gramMatch = t.match(/(\d+)\s*g(rams?)?/);
  if (gramMatch) {
    const g = parseInt(gramMatch[1]);
    if (g > 50 && g <= 500) return g / 100; // treat 100g as baseline
  }
  return 1;
}

function fallbackFoodEstimate(description) {
  const t = description.toLowerCase();
  const multiplier = extractQuantityMultiplier(t);

  // score each entry by how many keywords match
  let best = null, bestScore = 0;
  for (const entry of FOOD_DB) {
    const score = entry.words.filter(w => t.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = entry; }
  }

  if (best && bestScore > 0) {
    const m = multiplier !== 1 ? multiplier : 1;
    return {
      cal:     Math.round(best.cal     * m),
      protein: Math.round(best.protein * m),
      carbs:   Math.round(best.carbs   * m),
      fat:     Math.round(best.fat     * m),
      note: multiplier !== 1 ? `Estimated for ×${multiplier} serving` : 'Estimated from food database',
    };
  }
  return { cal: 300, protein: 8, carbs: 40, fat: 10, note: 'Generic estimate — try being more specific e.g. "2 chapati with dal"' };
}

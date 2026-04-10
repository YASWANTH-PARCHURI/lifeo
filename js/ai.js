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

  /* ── FOOD TEXT ESTIMATION ── */
  async estimateFoodText(description, meal) {
    if (!this.enabled) return fallbackFoodEstimate(description);
    const system = `You are a nutrition expert specializing in Indian food. The user describes what they ate in natural language — Indian home food, street food, or quantity descriptions like "2 chapati", "250g rice with dal", "glass of milk", "2 tbsp peanut butter".

Estimate total calories and macros for everything described. Respond ONLY with valid JSON, no markdown:
{"cal":number,"protein":number,"carbs":number,"fat":number,"note":"brief note"}

Use realistic standard Indian home-cooked portions. For quantities given, use those exactly.`;
    try {
      const raw = await this.call([{ role: 'user', content: description }], system, 200);
      const json = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(json);
    } catch(e) {
      return fallbackFoodEstimate(description);
    }
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
function fallbackFoodEstimate(description) {
  const t = description.toLowerCase();
  const estimates = [
    { words: ['rice','dal','sabzi'], cal: 450, protein: 12, carbs: 80, fat: 8 },
    { words: ['chapati','roti','sabzi'], cal: 300, protein: 8, carbs: 55, fat: 6 },
    { words: ['idli','sambar'], cal: 250, protein: 8, carbs: 45, fat: 3 },
    { words: ['dosa'], cal: 200, protein: 4, carbs: 35, fat: 6 },
    { words: ['oats','oatmeal'], cal: 150, protein: 5, carbs: 27, fat: 3 },
    { words: ['egg','eggs'], cal: 140, protein: 12, carbs: 1, fat: 10 },
    { words: ['milk','glass of milk'], cal: 120, protein: 6, carbs: 10, fat: 5 },
    { words: ['banana'], cal: 90, protein: 1, carbs: 23, fat: 0 },
    { words: ['peanut butter'], cal: 190, protein: 8, carbs: 6, fat: 16 },
    { words: ['coffee','tea'], cal: 10, protein: 0, carbs: 2, fat: 0 },
    { words: ['biryani'], cal: 500, protein: 18, carbs: 70, fat: 16 },
    { words: ['paneer'], cal: 350, protein: 20, carbs: 10, fat: 24 },
    { words: ['chicken'], cal: 280, protein: 30, carbs: 5, fat: 14 },
  ];
  for (const e of estimates) {
    if (e.words.some(w => t.includes(w))) {
      return { ...e, note: 'Rough estimate — add API key for precise calculation' };
    }
  }
  return { cal: 300, protein: 10, carbs: 40, fat: 10, note: 'Generic estimate — describe food in more detail for accuracy' };
}

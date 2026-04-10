# LifeO — Your Personal Life OS

A production PWA for tracking tasks, food, exercise, goals, and projects. Installable on any phone.

## Features
- **Tasks** — persistent across sessions (localStorage)
- **Food** — manual logging + photo-to-calorie via Claude AI
- **Exercise** — workout log with streak tracking
- **Goals** — progress tracking
- **Projects** — kanban board
- **Dashboard** — cross-module calorie math (intake − burned = net)
- **Quick Capture** — type anything, AI routes it to the right module
- **Offline support** — service worker caches all assets

## Deploy to GitHub Pages (free hosting)

### Step 1 — Create GitHub repo
1. Go to [github.com](https://github.com) → New repository
2. Name it `lifeo` (or anything)
3. Set to **Public**
4. Do NOT initialize with README

### Step 2 — Upload files
Option A — drag and drop in GitHub web UI:
1. Open your new repo
2. Click "uploading an existing file"
3. Drag the entire `lifeo` folder contents (index.html, manifest.json, sw.js, css/, js/, icons/)
4. Commit

Option B — via terminal:
```bash
cd lifeo
git init
git add .
git commit -m "LifeO v1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/lifeo.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages
1. Repo → Settings → Pages
2. Source: Deploy from branch → `main` → `/ (root)`
3. Save
4. Your app is live at: `https://YOUR_USERNAME.github.io/lifeo`

### Step 4 — Add placeholder icons (required for PWA install)
Create two simple icons or use any image resized to 192×192 and 512×512 PNG:
- Save as `icons/icon-192.png`
- Save as `icons/icon-512.png`

You can generate them at: https://favicon.io/favicon-generator/

### Step 5 — Install on phone
**Android (Chrome):**
1. Open `https://YOUR_USERNAME.github.io/lifeo` in Chrome
2. Tap the 3-dot menu → "Add to Home Screen"
3. Tap "Add"

**iPhone (Safari):**
1. Open in Safari
2. Tap Share button → "Add to Home Screen"
3. Tap "Add"

## Add Claude API key (for AI features)
1. Get your key at [console.anthropic.com](https://console.anthropic.com)
2. Open LifeO → Settings (⚙) → paste key → Save
3. AI features activate: smart routing + food photo calorie estimation

## Data
All data stored locally on your device via localStorage. Nothing goes to any server (except Claude API calls when AI features are used).

# IHR Normative Observatory

A web application for analyzing whether a country's domestic legal architecture
genuinely enables compliance with the International Health Regulations (IHR 2005
and 2024 amendments).

**Languages supported:** English · Español · Français  
**Analysis output:** configurable per-analysis (EN / ES / FR)

---

## Architecture

```
observatorio-rsi/
├── backend/          FastAPI + SQLAlchemy (Python 3.12)
│   ├── main.py       All API endpoints
│   ├── models.py     PostgreSQL models
│   ├── schemas.py    Pydantic request/response schemas
│   ├── skill_prompt.py  The RSI skill as system prompts
│   ├── database.py   DB connection
│   └── Dockerfile
├── frontend/         React + Vite
│   └── src/
│       ├── App.jsx
│       ├── pages/    CountriesPage, AnalysisPage
│       ├── lib/api.js   All fetch calls
│       └── i18n/     EN / ES / FR translations
├── railway.toml      Railway deploy config
└── README.md
```

---

## Local development

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL (or Docker)
- Anthropic API key

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env: add your ANTHROPIC_API_KEY and DATABASE_URL

uvicorn main:app --reload
# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### 2. Database (local with Docker)

```bash
docker run -d \
  --name ihr-db \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=observatorio_rsi \
  -p 5432:5432 \
  postgres:16-alpine
```

Then in your `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/observatorio_rsi
```

Tables are created automatically on first startup (`Base.metadata.create_all`).

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# VITE_API_URL=http://localhost:8000 (already set)

npm run dev
# App at http://localhost:5173
```

---

## Deploy to Railway

### Step 1 — Create Railway project

1. Go to [railway.app](https://railway.app) and create a new project
2. Click **New Service → GitHub Repo** and select this repository
3. Railway will detect the `railway.toml` and configure the backend service

### Step 2 — Add PostgreSQL

In your Railway project:
1. Click **New Service → Database → PostgreSQL**
2. Railway automatically sets `DATABASE_URL` in your environment

### Step 3 — Set environment variables

In the backend service settings → Variables:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
FRONTEND_URL=https://your-frontend.vercel.app
```

Railway automatically provides `DATABASE_URL` and `PORT`.

### Step 4 — Exporting Data for Analysis

Once an analysis is complete, use the **"Export JSON"** button in the UI or access:
`GET /analyses/{id}/export`

This returns a flattened JSON structure containing:
- Quantitative C1 scores (1.1 to 1.5)
- Normative chain status (Norm → Actor → Authority → Enforceability)
- Severity levels for all findings.

Perfect for comparative legal analysis in Excel, Python, or R.

### Step 5 — Deploy frontend to Vercel

```bash
cd frontend
npm run build
# Then deploy the dist/ folder to Vercel, Netlify, or any static host
```

Or use Vercel CLI:
```bash
npm install -g vercel
cd frontend
vercel --prod
```

Set environment variable in Vercel:
```
VITE_API_URL=https://your-backend.railway.app
```

### Step 5 — Done

Your app will be live. Railway auto-deploys on every push to main.

---

## How the analysis works

### Two language systems (independent)

| System | What it controls | Where to set |
|--------|-----------------|--------------|
| **UI language** | Menus, buttons, labels | Top-right switcher (EN/ES/FR) — stored in browser |
| **Analysis language** | Claude's output (findings, proposals) | Per-analysis language selector — stored in DB |

These are independent: you can read the UI in French while the analysis is in Spanish.

### Analysis flow

```
1. Add country (ISO3, name, legal system, federal/unitary)
2. Create analysis → choose output language
3. Discover corpus (Claude searches the web for all normative instruments)
4. User validates corpus: move items between Include / Review / Discard
         ↓ user can add instruments manually
5. Confirm corpus → analysis enabled
6. Analyze blocks A through G + SCORES (each independently, with streaming)
7. View results: gap table, C1 score, e-SPAR comparison, reform proposals
```

### Source date traceability

Each analysis stores:
- `consulted_at`: when the document was fetched
- `last_reform_date`: the date of the last reform found
- `last_reform_label`: human-readable label (e.g. "DOF 15-01-2026")

The UI shows these dates prominently so users can decide whether to re-run
an analysis when reforms are published.

### IHR blocks analyzed

| Block | IHR Articles | Topic |
|-------|-------------|-------|
| A | 4, 4bis, 6, 7, 10 | Institutional architecture |
| B | 5, 13, 46, Annex 1A | Core capacities |
| C | 19–22, 28, 29, Annex 1B | Points of entry |
| D | 23, 24, 27, 30–32, 42 | Measures on persons/goods |
| E | 45, 36–39, Annexes 6–7 | Data and documents |
| F | 43, 44bis, 54, 54bis | Additional measures & accountability |
| G | 25, 33, 40–41 | Inverse compatibility check |
| SCORES | — | C1 score + e-SPAR comparison + reform proposals |

---

## API reference

Full interactive docs at `/docs` (Swagger) when running locally.

Key endpoints:

```
GET    /countries                     List all countries
POST   /countries                     Add a country
GET    /countries/{iso3}/analyses     List analyses for a country
POST   /countries/{iso3}/analyses     Create new analysis (?lang=en|es|fr)
GET    /analyses/{id}                 Get analysis with all results
PATCH  /analyses/{id}/language        Change analysis output language
POST   /analyses/{id}/discover-corpus Stream corpus discovery
GET    /analyses/{id}/corpus          Get corpus items
PATCH  /corpus-items/{id}             Update classification/notes
POST   /analyses/{id}/corpus          Add instrument manually
POST   /analyses/{id}/confirm-corpus  Lock corpus, enable analysis
POST   /analyses/{id}/analyze/{block} Stream block analysis (A-G, SCORES)
PATCH  /analyses/{id}/espar-score     Save e-SPAR reference score
GET    /health                        Health check
```

---

## Estimated monthly cost

| Service | Cost |
|---------|------|
| Railway (backend + PostgreSQL) | ~$20/month |
| Vercel (frontend) | Free |
| Anthropic API (5-10 users, moderate use) | ~$30–80/month |
| **Total** | **~$50–100/month** |

---

## Adding a new country

Via the UI: click "+ Add country" and fill in ISO3, name, legal system, federal/unitary.

Via API:
```bash
curl -X POST https://your-backend.railway.app/countries \
  -H "Content-Type: application/json" \
  -d '{"iso3":"CHE","name_en":"Switzerland","legal_system":"civil_law","is_federal":"yes"}'
```

# PrepAI – AI-Powered Interview Prep

Full-stack app: FastAPI backend + React frontend + Groq LLM

## Quick Start

### 1. Get a free Groq API key
→ https://console.groq.com  (free, no credit card)

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
export GROQ_API_KEY=your_key_here   # or create a .env file
uvicorn main:app --reload
# Runs on http://localhost:8000
# Docs at http://localhost:8000/docs
```

### 3. Frontend

```bash
cd frontend
npm install
# Optional: create .env with VITE_API_URL=http://localhost:8000
npm run dev
# Runs on http://localhost:5173
```

---

## Deployment (Day 3)

### Backend → Render
1. Push `backend/` to GitHub
2. New Web Service on render.com → pick repo
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add env var: `GROQ_API_KEY=your_key`

### Frontend → Vercel
1. Push `frontend/` to GitHub
2. Import on vercel.com
3. Add env var: `VITE_API_URL=https://your-render-url.onrender.com`
4. Deploy

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/generate-questions` | Takes JD, returns 7 questions + session_id |
| POST | `/evaluate-answer` | Takes question + answer, returns score + feedback |
| GET  | `/sessions` | Lists recent sessions |
| GET  | `/sessions/{id}/results` | All answers for a session |
| GET  | `/health` | Health check |

---

## Project Structure

```
interview-prep/
├── backend/
│   ├── main.py          # FastAPI app
│   ├── requirements.txt
│   └── sessions.db      # auto-created on first run
└── frontend/
    ├── src/
│   ├── App.jsx      # Main React component
│   └── main.jsx
    ├── index.html
    ├── package.json
    └── vite.config.js
```

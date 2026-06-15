# PrepAI — AI-Powered Interview Prep

> Practice job interviews with AI-generated questions, instant feedback, score tracking, and study resources — all tailored to any job description you paste.

---

## What it does

1. **Paste a job description** — the app generates 7 role-specific interview questions (behavioral, technical, situational)
2. **Answer each question** — get an instant score out of 10, verdict, strengths, areas to improve, and a curated study resource
3. **Retry any question** — re-answer to improve your score; the AI compares attempts and tracks your progress
4. **Review past sessions** — full history with score timelines showing improvement across attempts

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| LLM | Groq API — `llama-3.3-70b-versatile` (free tier) |
| Database | SQLite (local) / PostgreSQL (production) |
| Auth | JWT + bcrypt |
| Frontend | React + Vite |
| Deployment | Render (backend) + Vercel (frontend) |

---

## Features

- 🔐 **Auth** — sign up / sign in with JWT-based authentication
- 🎯 **Role-specific questions** — 7 questions generated from any job description
- 📊 **Instant scoring** — every answer scored 1–10 with verdict (Strong / Good / Needs Work / Weak)
- 🔄 **Retry & improve** — re-attempt any question and see score delta (+2, -1)
- 📈 **Score timeline** — visual history of all attempts per question
- 📚 **Study resources** — a curated link recommended after every answer
- 🏷️ **Session titles** — AI-generated short title for each session (e.g. "SWE Intern", "Data Analyst")
- 🕓 **Session history** — review all past sessions, retry questions directly from history

---

## Local Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- Free [Groq API key](https://console.groq.com)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/prepai.git
cd PrepAI
```

### 2. Backend

```bash
cd back_end
python -m venv env
source env/bin/activate        # Windows: env\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `back_end/`:

```env
GROQ_API_KEY=your_groq_api_key_here
JWT_SECRET=any_long_random_string_here
```

Start the server:

```bash
uvicorn main:app --reload
# API runs at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

### 3. Frontend

```bash
cd front_end
npm install
```

Create a `.env` file in `front_end/`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

Start the dev server:

```bash
npm run dev
# App runs at http://localhost:5173
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | ❌ | Create account |
| POST | `/login` | ❌ | Sign in, returns JWT |
| POST | `/generate-questions` | ✅ | Generate 7 questions from JD |
| POST | `/evaluate-answer` | ✅ | Score an answer, return feedback |
| GET | `/sessions` | ✅ | List all sessions for current user |
| GET | `/sessions/{id}/results` | ✅ | Full results for a session |
| GET | `/health` | ❌ | Health check |

---

## Project Structure

```
prepai/
├── back_end/
│   ├── main.py              # FastAPI app — all routes and logic
│   ├── requirements.txt
│   ├── .env                 # GROQ_API_KEY, JWT_SECRET (not committed)
│   └── sessions.db          # SQLite DB, auto-created on first run
│
└── front_end/
    ├── src/
    │   ├── App.jsx           # Entire React app (auth, session, history)
    │   └── main.jsx
    ├── index.html
    ├── .env                  # VITE_API_URL (not committed)
    ├── package.json
    └── vite.config.js
```

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `GROQ_API_KEY` | `back_end/.env` | Free key from console.groq.com |
| `JWT_SECRET` | `back_end/.env` | Any long random string for signing tokens |
| `VITE_API_URL` | `front_end/.env` | Backend URL (default: `http://127.0.0.1:8000`) |
<!--
## Deployment

### Backend → https://ps1-kvgai-tech-full-stack.onrender.com

### Frontend → https://ps-1-kvgai-tech-full-stack.vercel.app/
-->
---

## Screenshots
<img width="1830" height="938" alt="Screenshot from 2026-05-28 15-44-45" src="https://github.com/user-attachments/assets/1e52ba51-7b1b-4a0a-b2ca-75e5e9fabcbb" />
<img width="1836" height="937" alt="Screenshot from 2026-05-28 15-46-02" src="https://github.com/user-attachments/assets/a8e540f9-f643-4782-b5ce-fda1ecac845a" />
<img width="1831" height="939" alt="Screenshot from 2026-05-28 15-47-22" src="https://github.com/user-attachments/assets/ee8a95b8-c13e-49f9-91d1-dec55d80f0fb" />
<img width="1836" height="939" alt="Screenshot from 2026-05-28 15-48-11" src="https://github.com/user-attachments/assets/68d91240-7bdb-42d4-ab0a-209177042f93" />
<img width="1833" height="937" alt="Screenshot from 2026-05-28 15-50-18" src="https://github.com/user-attachments/assets/805e4cf7-cc41-4b46-bee6-23dbb1796045" />
<img width="1834" height="936" alt="Screenshot from 2026-05-28 15-50-45" src="https://github.com/user-attachments/assets/8f14ceba-6c78-4af3-9b2c-d174311afef9" />
<img width="1836" height="940" alt="Screenshot from 2026-05-28 15-51-15" src="https://github.com/user-attachments/assets/16015017-8294-41ef-adeb-45434d5832ab" />
<img width="1833" height="937" alt="Screenshot from 2026-05-28 15-51-44" src="https://github.com/user-attachments/assets/74344d28-4575-4e00-8d5d-6f17afa29691" />

---

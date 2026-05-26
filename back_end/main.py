from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import sqlite3
import os
import json
import httpx
from datetime import datetime
load_dotenv()
app = FastAPI(title="AI Interview Prep API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "your_groq_api_key_here")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "llama-3.3-70b-versatile"

# ── DB setup ──────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect("sessions.db")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_description TEXT,
            questions TEXT,
            created_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            question TEXT,
            answer TEXT,
            feedback TEXT,
            score INTEGER,
            created_at TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ── Groq helper ───────────────────────────────────────────
async def call_groq(messages: list, max_tokens: int = 800) -> str:
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {"model": MODEL, "messages": messages, "max_tokens": max_tokens}
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(GROQ_URL, headers=headers, json=body)
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]

# ── Models ────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    job_description: str

class EvaluateRequest(BaseModel):
    session_id: int
    question: str
    answer: str

# ── Routes ────────────────────────────────────────────────
@app.post("/generate-questions")
async def generate_questions(req: GenerateRequest):
    if len(req.job_description.strip()) < 30:
        raise HTTPException(400, "Job description too short")

    prompt = f"""You are an expert technical interviewer.
Given this job description, generate exactly 7 interview questions.
Mix of: 2 behavioral, 3 technical, 2 situational.
Return ONLY a JSON array of strings like: ["Question 1", "Question 2", ...]

Job Description:
{req.job_description}"""

    raw = await call_groq([{"role": "user", "content": prompt}])
    
    # Extract JSON array from response
    start, end = raw.find("["), raw.rfind("]") + 1
    questions = json.loads(raw[start:end])

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO sessions (job_description, questions, created_at) VALUES (?, ?, ?)",
        (req.job_description, json.dumps(questions), datetime.utcnow().isoformat())
    )
    session_id = cur.lastrowid
    conn.commit()
    conn.close()

    return {"session_id": session_id, "questions": questions}


@app.post("/evaluate-answer")
async def evaluate_answer(req: EvaluateRequest):
    prompt = f"""You are a senior interviewer evaluating a candidate's answer.

Question: {req.question}
Candidate's Answer: {req.answer}

Evaluate the answer and return ONLY a JSON object with these exact keys:
{{
  "score": <integer 1-10>,
  "verdict": "<one of: Strong | Good | Needs Work | Weak>",
  "strengths": "<one sentence on what was good>",
  "improvements": "<one sentence on what to improve>",
  "ideal_hint": "<one sentence giving a hint about the ideal answer>"
}}"""

    raw = await call_groq([{"role": "user", "content": prompt}])
    start, end = raw.find("{"), raw.rfind("}") + 1
    feedback_obj = json.loads(raw[start:end])

    conn = get_db()
    conn.execute(
        "INSERT INTO answers (session_id, question, answer, feedback, score, created_at) VALUES (?,?,?,?,?,?)",
        (req.session_id, req.question, req.answer,
         json.dumps(feedback_obj), feedback_obj["score"], datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()

    return feedback_obj


@app.get("/sessions")
def get_sessions():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, job_description, created_at FROM sessions ORDER BY id DESC LIMIT 10"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/sessions/{session_id}/results")
def get_results(session_id: int):
    conn = get_db()
    answers = conn.execute(
        "SELECT question, answer, feedback, score FROM answers WHERE session_id=? ORDER BY id",
        (session_id,)
    ).fetchall()
    conn.close()
    return [
        {**dict(a), "feedback": json.loads(a["feedback"])}
        for a in answers
    ]


@app.get("/health")
def health():
    return {"status": "ok"}

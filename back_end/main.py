
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, field_validator
from typing import Optional
import sqlite3, os, json, httpx, secrets
from datetime import datetime, timedelta
from dotenv import load_dotenv
import bcrypt
import jwt
 
load_dotenv()
 
app = FastAPI(title="AI Interview Prep API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
 
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
MODEL        = "llama-3.3-70b-versatile"
JWT_SECRET   = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    JWT_SECRET = secrets.token_hex(32)
    print("⚠️  JWT_SECRET not set in .env — tokens will be invalidated on every restart!")
 
JWT_EXPIRE_DAYS = 7
security = HTTPBearer()
 
# ── DB ────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect("sessions.db")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
 
def init_db():
    conn = get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                email         TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name          TEXT,
                created_at    TEXT
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL,
                title           TEXT,
                job_description TEXT,
                questions       TEXT,
                created_at      TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS attempts (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      INTEGER NOT NULL,
                question_index  INTEGER NOT NULL,
                question        TEXT,
                answer          TEXT,
                feedback        TEXT,
                score           INTEGER,
                attempt_number  INTEGER,
                created_at      TEXT,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_attempts_session ON attempts(session_id, question_index);
        """)
        # migrate: add title column if it doesn't exist yet (safe on existing DBs)
        try:
            conn.execute("ALTER TABLE sessions ADD COLUMN title TEXT")
            conn.commit()
        except Exception:
            pass  # column already exists
        conn.commit()
    finally:
        conn.close()
 
init_db()
 
# ── Auth helpers ──────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
 
def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())
 
def create_token(user_id: int, email: str) -> str:
    return jwt.encode(
        {"user_id": user_id, "email": email,
         "exp": datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS)},
        JWT_SECRET, algorithm="HS256"
    )
 
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired — please sign in again")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
 
# ── Groq ──────────────────────────────────────────────────
async def call_groq(messages: list, max_tokens: int = 1000) -> str:
    if not GROQ_API_KEY:
        raise HTTPException(500, "GROQ_API_KEY is not configured on the server")
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(GROQ_URL, headers=headers,
            json={"model": MODEL, "messages": messages, "max_tokens": max_tokens})
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]
 
def extract_json_object(raw: str) -> dict:
    start, end = raw.find("{"), raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in LLM response")
    return json.loads(raw[start:end])
 
def extract_json_array(raw: str) -> list:
    start, end = raw.find("["), raw.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON array found in LLM response")
    return json.loads(raw[start:end])
 
# ── Pydantic models ───────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
 
    @field_validator("password")
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v
 
    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()
 
class LoginRequest(BaseModel):
    email: str
    password: str
 
class GenerateRequest(BaseModel):
    job_description: str
 
class EvaluateRequest(BaseModel):
    session_id: int
    question_index: int
    question: str
    answer: str
 
# ── Auth routes ───────────────────────────────────────────
@app.post("/register")
def register(req: RegisterRequest):
    conn = get_db()
    try:
        if conn.execute("SELECT id FROM users WHERE email=?", (req.email,)).fetchone():
            raise HTTPException(400, "Email already registered")
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)",
            (req.email, hash_password(req.password), req.name, datetime.utcnow().isoformat()))
        user_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()
    return {"token": create_token(user_id, req.email), "name": req.name, "email": req.email}
 
@app.post("/login")
def login(req: LoginRequest):
    conn = get_db()
    try:
        user = conn.execute("SELECT * FROM users WHERE email=?", (req.email,)).fetchone()
    finally:
        conn.close()
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return {"token": create_token(user["id"], user["email"]), "name": user["name"], "email": user["email"]}
 
# ── Core routes ───────────────────────────────────────────
@app.post("/generate-questions")
async def generate_questions(req: GenerateRequest, user=Depends(get_current_user)):
    if len(req.job_description.strip()) < 30:
        raise HTTPException(400, "Job description too short (min 30 chars)")
 
    # Call 1: generate questions
    questions_prompt = f"""You are an expert technical interviewer.
Generate exactly 7 interview questions for this job description.
Mix: 2 behavioral, 3 technical, 2 situational.
Return ONLY a JSON array of strings, nothing else:
["Question 1", "Question 2", "Question 3", "Question 4", "Question 5", "Question 6", "Question 7"]
 
Job Description: {req.job_description}"""
 
    # Call 2: generate title (runs concurrently)
    title_prompt = f"""Given this job description, reply with ONLY a 2-3 word job title.
Examples: SWE Intern, Full Stack Dev, Data Analyst, Product Manager, Backend Engineer
Maximum 3 words. No quotes, no punctuation, just the words.
 
Job Description: {req.job_description}"""
 
    try:
        import asyncio
        questions_raw, title_raw = await asyncio.gather(
            call_groq([{"role": "user", "content": questions_prompt}], max_tokens=800),
            call_groq([{"role": "user", "content": title_prompt}], max_tokens=20),
        )
        questions = extract_json_array(questions_raw)
        # strip any stray quotes/punctuation the LLM might add
        title = title_raw.strip().strip('"\'').strip()
        if not title or len(title) > 60:
            title = "Interview Session"
    except (ValueError, json.JSONDecodeError, KeyError) as e:
        raise HTTPException(502, f"Failed to parse AI response: {e}")
 
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO sessions (user_id, title, job_description, questions, created_at) VALUES (?,?,?,?,?)",
            (user["user_id"], title, req.job_description, json.dumps(questions), datetime.utcnow().isoformat()))
        session_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()
 
    return {"session_id": session_id, "title": title, "questions": questions}
 
 
@app.post("/evaluate-answer")
async def evaluate_answer(req: EvaluateRequest, user=Depends(get_current_user)):
    conn = get_db()
    try:
        session = conn.execute(
            "SELECT id FROM sessions WHERE id=? AND user_id=?",
            (req.session_id, user["user_id"])).fetchone()
        if not session:
            raise HTTPException(403, "Not your session")
 
        prev_attempts = conn.execute(
            "SELECT score, answer FROM attempts WHERE session_id=? AND question_index=? ORDER BY attempt_number",
            (req.session_id, req.question_index)).fetchall()
        attempt_number = len(prev_attempts) + 1
    finally:
        conn.close()
 
    history_context = ""
    if prev_attempts:
        history_context = "\n\nCandidate's previous attempts:\n" + "".join(
            f"Attempt {i+1} (score {a['score']}/10): {a['answer']}\n"
            for i, a in enumerate(prev_attempts)
        )
 
    prompt = f"""You are a senior interviewer evaluating a candidate's answer.
 
Question: {req.question}
Current Answer (Attempt {attempt_number}): {req.answer}{history_context}
 
Evaluate and return ONLY this JSON object (no extra text):
{{
  "score": <integer 1-10>,
  "verdict": "<Strong | Good | Needs Work | Weak>",
  "strengths": "<one sentence on what was good>",
  "improvements": "<one concrete sentence on what to improve next>",
  "ideal_hint": "<one sentence hinting at an ideal answer>",
  "improvement_from_last": "<if attempt > 1: one sentence comparing to previous attempt, else empty string>",
  "resource": {{
    "title": "<title of one highly relevant article, book chapter, or documentation page>",
    "url": "<a real, publicly accessible URL for that resource>",
    "reason": "<one sentence on why this resource helps with this specific question>"
  }}
}}"""
 
    try:
        raw = await call_groq([{"role": "user", "content": prompt}])
        feedback_obj = extract_json_object(raw)
        required = {"score", "verdict", "strengths", "improvements", "ideal_hint"}
        if not required.issubset(feedback_obj):
            raise ValueError(f"Missing fields: {required - feedback_obj.keys()}")
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(502, f"Failed to parse feedback from AI: {e}")
 
    score_delta = None
    if prev_attempts:
        score_delta = feedback_obj["score"] - prev_attempts[-1]["score"]
 
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO attempts (session_id, question_index, question, answer, feedback, score, attempt_number, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (req.session_id, req.question_index, req.question, req.answer,
             json.dumps(feedback_obj), feedback_obj["score"], attempt_number, datetime.utcnow().isoformat()))
        conn.commit()
    finally:
        conn.close()
 
    return {**feedback_obj, "attempt_number": attempt_number, "score_delta": score_delta}
 
 
@app.get("/sessions")
def get_sessions(user=Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, title, job_description, created_at FROM sessions WHERE user_id=? ORDER BY id DESC LIMIT 20",
            (user["user_id"],)).fetchall()
    finally:
        conn.close()
    result = []
    for r in rows:
        d = dict(r)
        if not d.get("title"):
            words = (d.get("job_description") or "").split()
            d["title"] = " ".join(words[:6]) + ("..." if len(words) > 6 else "")
        result.append(d)
    return result
 
 
@app.get("/sessions/{session_id}/results")
def get_results(session_id: int, user=Depends(get_current_user)):
    conn = get_db()
    try:
        session = conn.execute(
            "SELECT id, title, questions FROM sessions WHERE id=? AND user_id=?",
            (session_id, user["user_id"])).fetchone()
        if not session:
            raise HTTPException(403, "Not your session")
 
        questions = json.loads(session["questions"])
        title = session["title"]
 
        all_attempts = conn.execute(
            "SELECT question_index, answer, feedback, score, attempt_number, created_at "
            "FROM attempts WHERE session_id=? ORDER BY question_index, attempt_number",
            (session_id,)).fetchall()
    finally:
        conn.close()
 
    grouped: dict[int, list] = {i: [] for i in range(len(questions))}
    for a in all_attempts:
        grouped[a["question_index"]].append({
            **dict(a),
            "feedback": json.loads(a["feedback"])
        })
 
    results = [
        {"question_index": i, "question": q, "attempts": grouped[i]}
        for i, q in enumerate(questions)
    ]
    return {"session_id": session_id, "title": title, "questions": questions, "results": results}
 
 
@app.get("/health")
def health():
    return {"status": "ok"}
 
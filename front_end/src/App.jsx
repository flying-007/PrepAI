import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const VERDICT_CONFIG = {
  Strong:     { color: "#00e676", bg: "rgba(0,230,118,0.12)", icon: "⚡" },
  Good:       { color: "#69f0ae", bg: "rgba(105,240,174,0.10)", icon: "✓" },
  "Needs Work":{ color: "#ffd740", bg: "rgba(255,215,64,0.10)", icon: "△" },
  Weak:       { color: "#ff5252", bg: "rgba(255,82,82,0.10)", icon: "✗" },
};

export default function App() {
  const [step, setStep] = useState("input"); // input | questions | results
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState({});
  const [evalLoading, setEvalLoading] = useState(false);
  const [results, setResults] = useState([]);

  async function handleGenerate() {
    if (jd.trim().length < 30) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_description: jd }),
      });
      const data = await res.json();
      setSessionId(data.session_id);
      setQuestions(data.questions);
      setCurrent(0);
      setAnswers({});
      setFeedback({});
      setDraft("");
      setStep("questions");
    } catch (e) {
      alert("Error connecting to backend. Is it running?");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!draft.trim()) return;
    setEvalLoading(true);
    const q = questions[current];
    try {
      const res = await fetch(`${API}/evaluate-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, question: q, answer: draft }),
      });
      const fb = await res.json();
      setFeedback(prev => ({ ...prev, [current]: fb }));
      setAnswers(prev => ({ ...prev, [current]: draft }));
    } finally {
      setEvalLoading(false);
    }
  }

  function handleNext() {
    if (current < questions.length - 1) {
      setCurrent(c => c + 1);
      setDraft(answers[current + 1] || "");
    } else {
      setStep("results");
    }
  }

  const avgScore = Object.values(feedback).length
    ? (Object.values(feedback).reduce((s, f) => s + f.score, 0) / Object.values(feedback).length).toFixed(1)
    : null;

  return (
    <div style={styles.root}>
      {/* Background grid */}
      <div style={styles.grid} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoMark}>▲</span>
          <span style={styles.logoText}>PrepAI</span>
        </div>
        {step !== "input" && (
          <button style={styles.ghostBtn} onClick={() => { setStep("input"); setJd(""); }}>
            ← New Session
          </button>
        )}
      </header>

      {/* ── STEP 1: Input ── */}
      {step === "input" && (
        <main style={styles.main}>
          <div style={styles.hero}>
            <p style={styles.eyebrow}>Interview Prep · Powered by AI</p>
            <h1 style={styles.h1}>
              Ace your next<br />
              <span style={styles.accent}>interview.</span>
            </h1>
            <p style={styles.sub}>
              Paste a job description → get tailored questions → get instant feedback on your answers.
            </p>
          </div>

          <div style={styles.card}>
            <label style={styles.label}>Job Description</label>
            <textarea
              style={styles.textarea}
              placeholder="Paste the full job description here — role, responsibilities, requirements..."
              value={jd}
              onChange={e => setJd(e.target.value)}
              rows={8}
            />
            <div style={styles.cardFooter}>
              <span style={{ ...styles.charCount, color: jd.length > 30 ? "#69f0ae" : "#555" }}>
                {jd.length} chars
              </span>
              <button
                style={{ ...styles.primaryBtn, opacity: jd.trim().length > 30 ? 1 : 0.4 }}
                disabled={jd.trim().length < 30 || loading}
                onClick={handleGenerate}
              >
                {loading ? <span style={styles.spinner}>⟳</span> : "Generate Questions →"}
              </button>
            </div>
          </div>
        </main>
      )}

      {/* ── STEP 2: Questions ── */}
      {step === "questions" && (
        <main style={styles.main}>
          <div style={styles.progressBar}>
            {questions.map((_, i) => (
              <div
                key={i}
                onClick={() => { setCurrent(i); setDraft(answers[i] || ""); }}
                style={{
                  ...styles.progressDot,
                  background: feedback[i] ? VERDICT_CONFIG[feedback[i].verdict]?.color || "#69f0ae"
                    : i === current ? "#fff" : "#333",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>

          <div style={styles.qCard}>
            <div style={styles.qMeta}>
              <span style={styles.qNum}>Q{current + 1} / {questions.length}</span>
            </div>
            <p style={styles.qText}>{questions[current]}</p>

            <textarea
              style={styles.answerBox}
              placeholder="Type your answer here..."
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={5}
              disabled={!!feedback[current]}
            />

            {!feedback[current] && (
              <button
                style={{ ...styles.primaryBtn, opacity: draft.trim() ? 1 : 0.4 }}
                disabled={!draft.trim() || evalLoading}
                onClick={handleSubmitAnswer}
              >
                {evalLoading ? <span style={styles.spinner}>⟳</span> : "Evaluate Answer"}
              </button>
            )}

            {feedback[current] && (
              <div style={{ ...styles.feedbackBox, background: VERDICT_CONFIG[feedback[current].verdict]?.bg }}>
                <div style={styles.feedbackHeader}>
                  <span style={{
                    ...styles.verdict,
                    color: VERDICT_CONFIG[feedback[current].verdict]?.color,
                  }}>
                    {VERDICT_CONFIG[feedback[current].verdict]?.icon} {feedback[current].verdict}
                  </span>
                  <span style={styles.score}>{feedback[current].score}/10</span>
                </div>
                <FeedbackRow label="Strengths" value={feedback[current].strengths} color="#69f0ae" />
                <FeedbackRow label="Improve" value={feedback[current].improvements} color="#ffd740" />
                <FeedbackRow label="Hint" value={feedback[current].ideal_hint} color="#82b1ff" />

                <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={handleNext}>
                  {current < questions.length - 1 ? "Next Question →" : "See Results →"}
                </button>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ── STEP 3: Results ── */}
      {step === "results" && (
        <main style={{ ...styles.main, maxWidth: 760 }}>
          <div style={styles.resultsHeader}>
            <h2 style={styles.h2}>Session Complete</h2>
            {avgScore && (
              <div style={styles.avgScore}>
                <span style={styles.avgNum}>{avgScore}</span>
                <span style={styles.avgLabel}>avg score</span>
              </div>
            )}
          </div>

          {questions.map((q, i) => {
            const fb = feedback[i];
            if (!fb) return null;
            const vc = VERDICT_CONFIG[fb.verdict];
            return (
              <div key={i} style={{ ...styles.resultCard, borderLeft: `3px solid ${vc?.color}` }}>
                <div style={styles.resultTop}>
                  <span style={styles.rqNum}>Q{i + 1}</span>
                  <span style={{ ...styles.verdict, color: vc?.color }}>{vc?.icon} {fb.verdict}</span>
                  <span style={styles.score}>{fb.score}/10</span>
                </div>
                <p style={styles.rq}>{q}</p>
                <p style={styles.ra}><em>Your answer:</em> {answers[i]}</p>
                <FeedbackRow label="Strengths" value={fb.strengths} color="#69f0ae" />
                <FeedbackRow label="Improve" value={fb.improvements} color="#ffd740" />
              </div>
            );
          })}

          <button style={{ ...styles.primaryBtn, marginTop: 24 }} onClick={() => { setStep("input"); setJd(""); }}>
            Start New Session
          </button>
        </main>
      )}
    </div>
  );
}

function FeedbackRow({ label, value, color }) {
  return (
    <div style={{ marginTop: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </span>
      <p style={{ margin: "4px 0 0", color: "#ccc", fontSize: 14, lineHeight: 1.6 }}>{value}</p>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#f0f0f0",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    position: "relative",
    overflowX: "hidden",
  },
  grid: {
    position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
    backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
    backgroundSize: "40px 40px",
  },
  header: {
    position: "relative", zIndex: 10,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "20px 40px", borderBottom: "1px solid #1e1e1e",
  },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: { fontSize: 18, color: "#00e676" },
  logoText: { fontSize: 16, fontWeight: 700, letterSpacing: 2, color: "#fff" },
  ghostBtn: {
    background: "none", border: "1px solid #333", color: "#888",
    padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13,
    fontFamily: "inherit",
  },
  main: {
    position: "relative", zIndex: 10,
    maxWidth: 680, margin: "0 auto", padding: "60px 24px",
  },
  hero: { marginBottom: 48 },
  eyebrow: { fontSize: 11, letterSpacing: 3, color: "#00e676", textTransform: "uppercase", margin: "0 0 16px" },
  h1: { fontSize: "clamp(40px, 8vw, 72px)", fontWeight: 800, lineHeight: 1.1, margin: "0 0 20px", fontFamily: "'DM Mono', monospace" },
  h2: { fontSize: 32, fontWeight: 800, margin: 0 },
  accent: { color: "#00e676" },
  sub: { fontSize: 16, color: "#888", lineHeight: 1.7, maxWidth: 480 },
  card: {
    background: "#111", border: "1px solid #222", borderRadius: 12, padding: 24,
  },
  label: { display: "block", fontSize: 11, letterSpacing: 2, color: "#555", textTransform: "uppercase", marginBottom: 12 },
  textarea: {
    width: "100%", background: "#0a0a0a", border: "1px solid #222", borderRadius: 8,
    color: "#f0f0f0", fontSize: 14, lineHeight: 1.7, padding: 16, resize: "vertical",
    fontFamily: "inherit", boxSizing: "border-box", outline: "none",
  },
  answerBox: {
    width: "100%", background: "#0d0d0d", border: "1px solid #222", borderRadius: 8,
    color: "#f0f0f0", fontSize: 14, lineHeight: 1.7, padding: 16, resize: "vertical",
    fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 16,
  },
  cardFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  charCount: { fontSize: 12, transition: "color 0.3s" },
  primaryBtn: {
    background: "#00e676", color: "#000", border: "none", borderRadius: 8,
    padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", transition: "opacity 0.2s",
  },
  spinner: { display: "inline-block", animation: "spin 0.8s linear infinite" },
  progressBar: { display: "flex", gap: 8, marginBottom: 36, flexWrap: "wrap" },
  progressDot: { width: 32, height: 6, borderRadius: 3, transition: "background 0.3s" },
  qCard: { background: "#111", border: "1px solid #222", borderRadius: 12, padding: 28 },
  qMeta: { marginBottom: 16 },
  qNum: { fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase" },
  qText: { fontSize: 20, lineHeight: 1.5, margin: "0 0 24px", fontWeight: 500 },
  feedbackBox: { borderRadius: 10, padding: 20, marginTop: 4 },
  feedbackHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  verdict: { fontWeight: 800, fontSize: 15 },
  score: { fontSize: 22, fontWeight: 800, color: "#fff" },
  resultsHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 },
  avgScore: { textAlign: "center" },
  avgNum: { display: "block", fontSize: 48, fontWeight: 800, color: "#00e676", lineHeight: 1 },
  avgLabel: { fontSize: 11, color: "#555", letterSpacing: 2, textTransform: "uppercase" },
  resultCard: {
    background: "#111", borderRadius: 10, padding: 20, marginBottom: 16,
    borderLeft: "3px solid #333",
  },
  resultTop: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 },
  rqNum: { fontSize: 11, color: "#555", letterSpacing: 2 },
  rq: { fontSize: 14, color: "#ccc", margin: "0 0 8px", lineHeight: 1.5 },
  ra: { fontSize: 13, color: "#666", margin: "0 0 8px", lineHeight: 1.5 },
};

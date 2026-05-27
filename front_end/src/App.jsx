import { useState, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const VERDICT = {
  Strong:      { color: "#00e676", bg: "rgba(0,230,118,0.12)", icon: "⚡" },
  Good:        { color: "#69f0ae", bg: "rgba(105,240,174,0.10)", icon: "✓" },
  "Needs Work":{ color: "#ffd740", bg: "rgba(255,215,64,0.10)", icon: "△" },
  Weak:        { color: "#ff5252", bg: "rgba(255,82,82,0.10)", icon: "✗" },
};

const FRESH_SESSION = { sessionId: null, title: "", questions: [], current: 0, attempts: {}, draft: "", step: "input", jd: "" };

export default function App() {
  const [auth, setAuth]           = useState(null);
  const [authMode, setAuthMode]   = useState("login");
  const [authForm, setAuthForm]   = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [sess, setSess] = useState(FRESH_SESSION);
  const [evalLoading, setEvalLoading]         = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);

  const [showHistory, setShowHistory]       = useState(false);
  const [sessions, setSessions]             = useState([]);
  const [historyData, setHistoryData]       = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [retryingIndex, setRetryingIndex]   = useState(null);
  const [retryDraft, setRetryDraft]         = useState("");
  const [retryLoading, setRetryLoading]     = useState(false);
  const [historyError, setHistoryError]     = useState("");

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth?.token}`,
  }), [auth?.token]);

  function signOut() {
    setAuth(null); setSess(FRESH_SESSION);
    setSessions([]); setHistoryData(null);
    setShowHistory(false); setAuthForm({ name: "", email: "", password: "" });
  }

  // ── Auth ──────────────────────────────────────────────
  async function handleAuth(e) {
    e.preventDefault(); setAuthError(""); setAuthLoading(true);
    try {
      const res = await fetch(`${API}${authMode === "login" ? "/login" : "/register"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authMode === "login"
          ? { email: authForm.email, password: authForm.password } : authForm),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.detail)
          ? data.detail.map(e => e.msg.replace("Value error, ", "")).join(", ")
          : data.detail || "Authentication failed";
        throw new Error(msg);
      }
      setAuth(data);
    } catch (err) { setAuthError(err.message); }
    finally { setAuthLoading(false); }
  }

  // ── History ───────────────────────────────────────────
  async function loadHistory() {
    setHistoryError(""); setHistoryLoading(true);
    try {
      const res = await fetch(`${API}/sessions`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load sessions");
      setSessions(await res.json());
      setShowHistory(true); setHistoryData(null);
    } catch (err) { setHistoryError(err.message); }
    finally { setHistoryLoading(false); }
  }

  async function loadSessionResults(sid) {
    setHistoryError(""); setHistoryLoading(true);
    setRetryingIndex(null); setRetryDraft("");
    try {
      const res = await fetch(`${API}/sessions/${sid}/results`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load session");
      setHistoryData(await res.json());
    } catch (err) { setHistoryError(err.message); }
    finally { setHistoryLoading(false); }
  }

  async function handleRetry(qIndex, question) {
    if (!retryDraft.trim()) return;
    setRetryLoading(true); setHistoryError("");
    try {
      const res = await fetch(`${API}/evaluate-answer`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ session_id: historyData.session_id, question_index: qIndex, question, answer: retryDraft }),
      });
      if (!res.ok) throw new Error("Evaluation failed");
      await loadSessionResults(historyData.session_id);
      setRetryingIndex(null); setRetryDraft("");
    } catch (err) { setHistoryError(err.message); }
    finally { setRetryLoading(false); }
  }

  // ── New session ───────────────────────────────────────
  async function handleGenerate() {
    if (sess.jd.trim().length < 30) return;
    setGenerateLoading(true);
    try {
      const res = await fetch(`${API}/generate-questions`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ job_description: sess.jd }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Failed to generate"); }
      const data = await res.json();
      setSess({ ...FRESH_SESSION, jd: sess.jd, sessionId: data.session_id, title: data.title, questions: data.questions, step: "questions" });
    } catch (err) { alert(err.message); }
    finally { setGenerateLoading(false); }
  }

  async function handleSubmitAnswer() {
    if (!sess.draft.trim()) return;
    setEvalLoading(true);
    try {
      const res = await fetch(`${API}/evaluate-answer`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ session_id: sess.sessionId, question_index: sess.current, question: sess.questions[sess.current], answer: sess.draft }),
      });
      if (!res.ok) throw new Error("Evaluation failed");
      const data = await res.json();
      setSess(prev => ({
        ...prev, draft: "",
        attempts: { ...prev.attempts, [prev.current]: [...(prev.attempts[prev.current] || []), data] },
      }));
    } catch (err) { alert(err.message); }
    finally { setEvalLoading(false); }
  }

  const latestFeedback = (idx) => { const arr = sess.attempts[idx]; return arr?.length ? arr[arr.length - 1] : null; };
  const answeredCount = Object.keys(sess.attempts).length;
  const avgScore = answeredCount
    ? (Object.values(sess.attempts).reduce((s, arr) => s + arr[arr.length - 1].score, 0) / answeredCount).toFixed(1)
    : null;

  // ── Auth screen ───────────────────────────────────────
  if (!auth) return (
    <div style={s.root}><div style={s.grid} />
      <div style={s.authWrap}>
        <div style={s.authCard}>
          <div style={s.logo}><span style={s.logoMark}>▲</span><span style={s.logoText}>PrepAI</span></div>
          <p style={s.authSub}>{authMode === "login" ? "Welcome back" : "Create your account"}</p>
          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {authMode === "signup" && <input style={s.input} placeholder="Full name" value={authForm.name} onChange={e => setAuthForm(p => ({ ...p, name: e.target.value }))} />}
            <input style={s.input} placeholder="Email" type="email" value={authForm.email} onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))} />
            <input style={s.input} placeholder="Password (min 6 chars)" type="password" value={authForm.password} onChange={e => setAuthForm(p => ({ ...p, password: e.target.value }))} />
            {authError && <p style={{ color: "#ff5252", fontSize: 13, margin: 0 }}>{authError}</p>}
            <button style={s.primaryBtn} type="submit" disabled={authLoading}>{authLoading ? "..." : authMode === "login" ? "Sign In" : "Create Account"}</button>
          </form>
          <p style={{ color: "#555", fontSize: 13, marginTop: 16, textAlign: "center" }}>
            {authMode === "login" ? "No account? " : "Already have one? "}
            <span style={{ color: "#00e676", cursor: "pointer" }} onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}>
              {authMode === "login" ? "Sign up" : "Sign in"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );

  // ── History screen ────────────────────────────────────
  if (showHistory) return (
    <div style={s.root}><div style={s.grid} />
      <header style={s.header}>
        <div style={s.logo}><span style={s.logoMark}>▲</span><span style={s.logoText}>PrepAI</span></div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={s.ghostBtn} onClick={() => { setShowHistory(false); setHistoryData(null); setHistoryError(""); }}>← Back</button>
          <button style={s.ghostBtn} onClick={signOut}>Sign Out</button>
        </div>
      </header>
      <main style={{ ...s.main, maxWidth: 960, display: "flex", gap: 28, alignItems: "flex-start" }}>

        {/* Sidebar */}
        <div style={{ width: 230, flexShrink: 0 }}>
          <p style={s.sectionLabel}>Sessions</p>
          {sessions.length === 0 && <p style={{ color: "#444", fontSize: 13 }}>No sessions yet.</p>}
          {sessions.map(session => (
            <div key={session.id} onClick={() => loadSessionResults(session.id)}
              style={{ ...s.histCard, borderColor: historyData?.session_id === session.id ? "#00e676" : "#222" }}>
              {/* Title badge */}
              <p style={{ color: "#00e676", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                {session.title || "Interview Session"}
              </p>
              <p style={{ color: "#666", fontSize: 11, marginBottom: 4, lineHeight: 1.4 }}>
                {session.job_description.slice(0, 50)}…
              </p>
              <p style={{ color: "#444", fontSize: 11 }}>{new Date(session.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {historyLoading && <p style={{ color: "#555", marginTop: 40 }}>Loading…</p>}
          {historyError && <p style={{ color: "#ff5252", marginTop: 20, fontSize: 13 }}>{historyError}</p>}
          {!historyData && !historyLoading && <p style={{ color: "#444", marginTop: 40 }}>← Select a session to review</p>}

          {historyData && <>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24, color: "#fff" }}>
              {historyData.title || "Session Results"}
            </h2>
            {historyData.results.map((item, i) => {
              const lastAttempt = item.attempts[item.attempts.length - 1];
              const totalDelta = item.attempts.length > 1 ? lastAttempt.score - item.attempts[0].score : null;
              const vc = lastAttempt ? VERDICT[lastAttempt.feedback?.verdict] : null;
              const resource = lastAttempt?.feedback?.resource;

              return (
                <div key={i} style={{ ...s.resultCard, borderLeft: `3px solid ${vc?.color || "#333"}`, marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "#555", letterSpacing: 1 }}>Q{i + 1}</span>
                    {lastAttempt && <>
                      <span style={{ color: vc?.color, fontWeight: 700 }}>{vc?.icon} {lastAttempt.feedback?.verdict}</span>
                      <span style={{ fontWeight: 800, fontSize: 18 }}>{lastAttempt.score}/10</span>
                      {totalDelta !== null && <DeltaBadge delta={totalDelta} label="from attempt 1" />}
                      <span style={{ fontSize: 11, color: "#444", marginLeft: "auto" }}>{item.attempts.length} attempt{item.attempts.length > 1 ? "s" : ""}</span>
                    </>}
                  </div>

                  <p style={{ color: "#ddd", fontSize: 15, marginBottom: 14, lineHeight: 1.5 }}>{item.question}</p>

                  {item.attempts.length > 1 && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                      {item.attempts.map((a, ai) => {
                        const avc = VERDICT[a.feedback?.verdict];
                        return (
                          <div key={ai} style={{ textAlign: "center" }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: avc?.bg || "#222", border: `2px solid ${avc?.color || "#333"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: avc?.color }}>{a.score}</div>
                            <div style={{ fontSize: 10, color: "#444", marginTop: 3 }}>#{ai + 1}</div>
                          </div>
                        );
                      })}
                      <span style={{ fontSize: 11, color: "#444", marginLeft: 4 }}>score history</span>
                    </div>
                  )}

                  {lastAttempt && <>
                    <p style={{ color: "#666", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                      <span style={{ color: "#444" }}>Latest answer: </span>{lastAttempt.answer}
                    </p>
                    {lastAttempt.feedback?.improvement_from_last && item.attempts.length > 1 && (
                      <div style={{ background: "rgba(130,177,255,0.08)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
                        <span style={{ fontSize: 11, color: "#82b1ff", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Progress</span>
                        <p style={{ color: "#ccc", fontSize: 13, margin: "4px 0 0", lineHeight: 1.5 }}>{lastAttempt.feedback.improvement_from_last}</p>
                      </div>
                    )}
                    <FeedbackRow label="Strengths" value={lastAttempt.feedback?.strengths}    color="#69f0ae" />
                    <FeedbackRow label="Improve"   value={lastAttempt.feedback?.improvements} color="#ffd740" />
                    <FeedbackRow label="Hint"      value={lastAttempt.feedback?.ideal_hint}   color="#82b1ff" />
                    {resource && <ResourceCard resource={resource} />}
                  </>}

                  {retryingIndex === i ? (
                    <div style={{ marginTop: 16 }}>
                      <textarea style={{ ...s.answerBox, marginBottom: 10 }} placeholder="Type your improved answer…"
                        value={retryDraft} onChange={e => setRetryDraft(e.target.value)} rows={4} />
                      <div style={{ display: "flex", gap: 10 }}>
                        <button style={{ ...s.primaryBtn, opacity: retryDraft.trim() ? 1 : 0.4 }}
                          disabled={!retryDraft.trim() || retryLoading} onClick={() => handleRetry(i, item.question)}>
                          {retryLoading ? "Evaluating…" : "Submit Retry"}
                        </button>
                        <button style={s.ghostBtn} onClick={() => { setRetryingIndex(null); setRetryDraft(""); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button style={{ ...s.ghostBtn, marginTop: 14, borderColor: "#333", color: "#aaa" }}
                      onClick={() => { setRetryingIndex(i); setRetryDraft(""); }}>
                      ↩ Retry this question
                    </button>
                  )}
                </div>
              );
            })}
          </>}
        </div>
      </main>
    </div>
  );

  // ── Main app ──────────────────────────────────────────
  return (
    <div style={s.root}><div style={s.grid} />
      <header style={s.header}>
        <div style={s.logo}><span style={s.logoMark}>▲</span><span style={s.logoText}>PrepAI</span></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#555" }}>Hi, {auth.name}</span>
          <button style={s.ghostBtn} onClick={loadHistory} disabled={historyLoading}>{historyLoading ? "…" : "History"}</button>
          {sess.step !== "input" && <button style={s.ghostBtn} onClick={() => setSess(FRESH_SESSION)}>+ New</button>}
          <button style={s.ghostBtn} onClick={signOut}>Sign Out</button>
        </div>
      </header>

      {/* Input */}
      {sess.step === "input" && (
        <main style={s.main}>
          <div style={s.hero}>
            <p style={s.eyebrow}>Interview Prep · Powered by AI</p>
            <h1 style={s.h1}>Ace your next<br /><span style={s.accent}>interview.</span></h1>
            <p style={s.sub}>Paste a job description → get tailored questions → get instant feedback.</p>
          </div>
          <div style={s.card}>
            <label style={s.label}>Job Description</label>
            <textarea style={s.textarea} placeholder="Paste the full job description here…"
              value={sess.jd} onChange={e => setSess(p => ({ ...p, jd: e.target.value }))} rows={8} />
            <div style={s.cardFooter}>
              <span style={{ ...s.charCount, color: sess.jd.length > 30 ? "#69f0ae" : "#555" }}>{sess.jd.length} chars</span>
              <button style={{ ...s.primaryBtn, opacity: sess.jd.trim().length > 30 ? 1 : 0.4 }}
                disabled={sess.jd.trim().length < 30 || generateLoading} onClick={handleGenerate}>
                {generateLoading ? "Generating…" : "Generate Questions →"}
              </button>
            </div>
          </div>
        </main>
      )}

      {/* Questions */}
      {sess.step === "questions" && (
        <main style={s.main}>
          {sess.title && (
            <p style={{ ...s.eyebrow, marginBottom: 8 }}>{sess.title}</p>
          )}
          <div style={s.progressBar}>
            {sess.questions.map((_, i) => (
              <div key={i} onClick={() => setSess(p => ({ ...p, current: i, draft: "" }))}
                style={{ ...s.progressDot, cursor: "pointer",
                  background: latestFeedback(i) ? VERDICT[latestFeedback(i).verdict]?.color || "#69f0ae"
                    : i === sess.current ? "#fff" : "#333" }} />
            ))}
          </div>

          <div style={s.qCard}>
            <span style={s.qNum}>Q{sess.current + 1} / {sess.questions.length}</span>
            <p style={s.qText}>{sess.questions[sess.current]}</p>

            {(sess.attempts[sess.current] || []).map((a, i) => {
              const avc = VERDICT[a.verdict];
              const resource = a.resource;
              return (
                <div key={i} style={{ ...s.feedbackBox, background: avc?.bg, marginBottom: 10 }}>
                  <div style={s.feedbackHeader}>
                    <span style={{ fontSize: 11, color: "#555" }}>Attempt {a.attempt_number}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {a.score_delta != null && <DeltaBadge delta={a.score_delta} />}
                      <span style={{ ...s.verdict, color: avc?.color }}>{avc?.icon} {a.verdict}</span>
                      <span style={s.score}>{a.score}/10</span>
                    </div>
                  </div>
                  <p style={{ color: "#666", fontSize: 12, margin: "6px 0 8px", lineHeight: 1.4 }}>{a.answer}</p>
                  {a.improvement_from_last && i > 0 && (
                    <p style={{ color: "#82b1ff", fontSize: 12, marginBottom: 6 }}>↑ {a.improvement_from_last}</p>
                  )}
                  <FeedbackRow label="Strengths" value={a.strengths}    color="#69f0ae" />
                  <FeedbackRow label="Improve"   value={a.improvements} color="#ffd740" />
                  <FeedbackRow label="Hint"      value={a.ideal_hint}   color="#82b1ff" />
                  {resource && <ResourceCard resource={resource} />}
                </div>
              );
            })}

            <textarea style={s.answerBox}
              placeholder={(sess.attempts[sess.current] || []).length > 0 ? "Try again with an improved answer…" : "Type your answer here…"}
              value={sess.draft} onChange={e => setSess(p => ({ ...p, draft: e.target.value }))} rows={5} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={{ ...s.primaryBtn, opacity: sess.draft.trim() ? 1 : 0.4 }}
                disabled={!sess.draft.trim() || evalLoading} onClick={handleSubmitAnswer}>
                {evalLoading ? "Evaluating…" : (sess.attempts[sess.current] || []).length > 0 ? "Submit Retry" : "Evaluate Answer"}
              </button>
              {(sess.attempts[sess.current] || []).length > 0 && sess.current < sess.questions.length - 1 && (
                <button style={s.ghostBtn} onClick={() => setSess(p => ({ ...p, current: p.current + 1, draft: "" }))}>Next Question →</button>
              )}
              {(sess.attempts[sess.current] || []).length > 0 && sess.current === sess.questions.length - 1 && (
                <button style={s.ghostBtn} onClick={() => setSess(p => ({ ...p, step: "results" }))}>See Results →</button>
              )}
            </div>
          </div>
        </main>
      )}

      {/* Results */}
      {sess.step === "results" && (
        <main style={{ ...s.main, maxWidth: 760 }}>
          <div style={s.resultsHeader}>
            <div>
              {sess.title && <p style={{ ...s.eyebrow, marginBottom: 6 }}>{sess.title}</p>}
              <h2 style={s.h2}>Session Complete</h2>
            </div>
            {avgScore && <div style={s.avgScore}><span style={s.avgNum}>{avgScore}</span><span style={s.avgLabel}>avg score</span></div>}
          </div>

          {sess.questions.map((q, i) => {
            const arr = sess.attempts[i] || [];
            if (!arr.length) return null;
            const last = arr[arr.length - 1];
            const vc = VERDICT[last.verdict];
            const delta = arr.length > 1 ? last.score - arr[0].score : null;
            const resource = last.resource;
            return (
              <div key={i} style={{ ...s.resultCard, borderLeft: `3px solid ${vc?.color}` }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#555" }}>Q{i + 1}</span>
                  <span style={{ ...s.verdict, color: vc?.color }}>{vc?.icon} {last.verdict}</span>
                  <span style={s.score}>{last.score}/10</span>
                  {delta !== null && <DeltaBadge delta={delta} label={`over ${arr.length} attempts`} />}
                </div>
                <p style={{ color: "#ccc", fontSize: 14, marginBottom: 8 }}>{q}</p>
                {arr.length > 1 && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
                    {arr.map((a, ai) => {
                      const avc = VERDICT[a.verdict];
                      return (
                        <div key={ai} style={{ textAlign: "center" }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: avc?.bg, border: `2px solid ${avc?.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: avc?.color }}>{a.score}</div>
                          <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>#{ai + 1}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <FeedbackRow label="Strengths" value={last.strengths}    color="#69f0ae" />
                <FeedbackRow label="Improve"   value={last.improvements} color="#ffd740" />
                {resource && <ResourceCard resource={resource} />}
              </div>
            );
          })}
          <button style={{ ...s.primaryBtn, marginTop: 24 }} onClick={() => setSess(FRESH_SESSION)}>Start New Session</button>
        </main>
      )}
    </div>
  );
}

// ── Shared components ─────────────────────────────────────
function FeedbackRow({ label, value, color }) {
  if (!value) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <p style={{ margin: "3px 0 0", color: "#ccc", fontSize: 13, lineHeight: 1.6 }}>{value}</p>
    </div>
  );
}

function DeltaBadge({ delta, label }) {
  if (delta === 0) return null;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      background: delta > 0 ? "rgba(0,230,118,0.15)" : "rgba(255,82,82,0.15)",
      color: delta > 0 ? "#00e676" : "#ff5252" }}>
      {delta > 0 ? `+${delta}` : delta}{label ? ` ${label}` : ""}
    </span>
  );
}

function ResourceCard({ resource }) {
  if (!resource?.url) return null;
  return (
    <div style={{ marginTop: 12, background: "rgba(255,215,64,0.05)", border: "1px solid rgba(255,215,64,0.15)", borderRadius: 8, padding: "10px 14px" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#ffd740", letterSpacing: 1, textTransform: "uppercase" }}>📚 Study Resource</span>
      <a href={resource.url} target="_blank" rel="noopener noreferrer"
        style={{ display: "block", color: "#82b1ff", fontSize: 13, fontWeight: 600, margin: "5px 0 3px", textDecoration: "none" }}>
        {resource.title} ↗
      </a>
      <p style={{ color: "#666", fontSize: 12, margin: 0, lineHeight: 1.5 }}>{resource.reason}</p>
    </div>
  );
}

const s = {
  root: { minHeight: "100vh", background: "#0a0a0a", color: "#f0f0f0", fontFamily: "'DM Mono', monospace", position: "relative" },
  grid: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize: "40px 40px" },
  header: { position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 40px", borderBottom: "1px solid #1e1e1e" },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: { fontSize: 18, color: "#00e676" },
  logoText: { fontSize: 16, fontWeight: 700, letterSpacing: 2, color: "#fff" },
  ghostBtn: { background: "none", border: "1px solid #333", color: "#888", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
  main: { position: "relative", zIndex: 10, maxWidth: 680, margin: "0 auto", padding: "60px 24px" },
  hero: { marginBottom: 48 },
  eyebrow: { fontSize: 11, letterSpacing: 3, color: "#00e676", textTransform: "uppercase", margin: "0 0 16px" },
  h1: { fontSize: "clamp(40px,8vw,72px)", fontWeight: 800, lineHeight: 1.1, margin: "0 0 20px" },
  h2: { fontSize: 32, fontWeight: 800, margin: 0 },
  accent: { color: "#00e676" },
  sub: { fontSize: 16, color: "#888", lineHeight: 1.7 },
  card: { background: "#111", border: "1px solid #222", borderRadius: 12, padding: 24 },
  label: { display: "block", fontSize: 11, letterSpacing: 2, color: "#555", textTransform: "uppercase", marginBottom: 12 },
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: "#555", textTransform: "uppercase", marginBottom: 16 },
  textarea: { width: "100%", background: "#0a0a0a", border: "1px solid #222", borderRadius: 8, color: "#f0f0f0", fontSize: 14, lineHeight: 1.7, padding: 16, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none" },
  answerBox: { width: "100%", background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, color: "#f0f0f0", fontSize: 14, lineHeight: 1.7, padding: 16, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 16 },
  cardFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  charCount: { fontSize: 12, transition: "color 0.3s" },
  primaryBtn: { background: "#00e676", color: "#000", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  progressBar: { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
  progressDot: { width: 32, height: 6, borderRadius: 3, transition: "background 0.3s" },
  qCard: { background: "#111", border: "1px solid #222", borderRadius: 12, padding: 28 },
  qNum: { fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase", display: "block", marginBottom: 16 },
  qText: { fontSize: 20, lineHeight: 1.5, margin: "0 0 24px", fontWeight: 500 },
  feedbackBox: { borderRadius: 10, padding: 16, marginTop: 4 },
  feedbackHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  verdict: { fontWeight: 800, fontSize: 15 },
  score: { fontSize: 22, fontWeight: 800, color: "#fff" },
  resultsHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 },
  avgScore: { textAlign: "center" },
  avgNum: { display: "block", fontSize: 48, fontWeight: 800, color: "#00e676", lineHeight: 1 },
  avgLabel: { fontSize: 11, color: "#555", letterSpacing: 2, textTransform: "uppercase" },
  resultCard: { background: "#111", borderRadius: 10, padding: 20, marginBottom: 16 },
  authWrap: { position: "relative", zIndex: 10, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" },
  authCard: { background: "#111", border: "1px solid #222", borderRadius: 16, padding: 40, width: "100%", maxWidth: 400 },
  authSub: { color: "#555", fontSize: 13, marginTop: 8, marginBottom: 28 },
  input: { background: "#0a0a0a", border: "1px solid #222", borderRadius: 8, color: "#f0f0f0", fontSize: 14, padding: "12px 16px", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  histCard: { background: "#111", border: "1px solid #222", borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer", transition: "border-color 0.2s" },
};
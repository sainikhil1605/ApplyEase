/* eslint-disable no-undef */
import { useEffect, useState } from "react";
import axiosInstance from "../../utils/axiosInstance";
import "./Dashboard.css";
import logo from "./icon2.png";

const Dashboard = () => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [matchResult, setMatchResult] = useState(null);
  const [appQuestion, setAppQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tailored, setTailored] = useState("");
  const [tlError, setTlError] = useState("");
  const [history, setHistory] = useState([]);
  useEffect(() => {
    const getData = () => {
      setError("");
      setLoading(true);
      axiosInstance
        .get("/user")
        .then((response) => {
          setUserData(response.data);
        })
        .catch((e) => {
          setError(e?.response?.data?.detail || e?.message || "Failed to load user");
        })
        .finally(() => setLoading(false));
    };
    getData();
    // Prefill JD from query param if present
    try {
      const p = new URLSearchParams(window.location.search);
      const jd = p.get("jd");
      if (jd) setJobDescription(jd);
    } catch {}
    // Load tailored history
    axiosInstance.get("/tailored_resumes").then((r) => setHistory(r.data.items || [])).catch(() => {});
  }, []);
  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    const formData = new FormData();
    if (userData?.resume instanceof File) {
      formData.append("resume", userData.resume);
    }
    formData.append("first_name", userData.first_name);
    formData.append("last_name", userData.last_name);
    if (userData?.email) formData.append("email", userData.email);
    if (userData?.phone) formData.append("phone", userData.phone);
    if (userData?.location) formData.append("location", userData.location);
    if (Array.isArray(userData.urls)) {
      formData.append("urls", JSON.stringify(userData.urls));
    }
    try {
      await axiosInstance.patch("/user", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };
  const handleMatch = async () => {
    if (!jobDescription.trim()) return;
    try {
      const resp = await axiosInstance.post("/match", { jobDescription });
      setMatchResult(resp.data);
    } catch (e) {
      console.log(e);
    }
  };
  const handleCustomAnswer = async () => {
    if (!jobDescription.trim() || !appQuestion.trim()) return;
    try {
      const resp = await axiosInstance.post("/custom-answer", {
        jobDescription,
        applicationQuestion: appQuestion,
      });
      setAnswer(resp.data.answer || "");
    } catch (e) {
      console.log(e);
    }
  };
  const handleTailored = async () => {
    setTlError("");
    if (!jobDescription.trim()) return setTlError("Paste a job description first.");
    try {
      const resp = await axiosInstance.post("/tailored_resume", { jobDescription, save: false });
      setTailored(resp.data.resume_text || "");
      // if match exists, refresh keywords panel
      if (!matchResult) {
        setMatchResult({ percent: 0, matchingWords: resp.data.matching_words || [], missingWords: resp.data.missing_words || [] });
      }
    } catch (e) {
      setTlError(e?.response?.data?.detail || e?.message || "Failed to generate tailored CV");
    }
  };
  const downloadTailored = async () => {
    try {
      if (!tailored.trim()) return;
      const resp = await axiosInstance.post("/render_pdf", { text: tailored, filename: "tailored_resume.pdf" }, { responseType: "blob" });
      const blob = new Blob([resp.data], { type: resp.headers['content-type'] || "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tailored_resume.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setTlError("Failed to download tailored CV PDF");
    }
  };
  const downloadResume = async () => {
    try {
      const token = localStorage.getItem("token");
      // Prefer the original stored file
      let res = await fetch(`${process.env.REACT_APP_API_BASE || "http://localhost:8000"}/resume_file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        res = await fetch(`${process.env.REACT_APP_API_BASE || "http://localhost:8000"}/resume_pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resume.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {}
  };

  return (
    <div className="ae-root">
      <div className="ae-container">
        <div className="ae-header">
          <div className="ae-brand">
            <img src={logo} alt="ApplyEase" className="ae-logo" />
            <div className="ae-title">ApplyEase Dashboard</div>
          </div>
          {matchResult && (
            <div className="ae-badge">Match {matchResult.percent}%</div>
          )}
        </div>

        {loading && <div className="ae-note">Loading...</div>}
        {error && <div className="ae-error">{error}</div>}

        <div className="ae-grid">
          <div className="ae-card">
            <h3>Profile & Resume</h3>
            <div className="ae-row">
              <div className="ae-field">
                <label>First Name</label>
                <input className="ae-input" type="text" value={userData?.first_name || ""} onChange={(e) => setUserData({ ...userData, first_name: e.target.value })} />
              </div>
              <div className="ae-field">
                <label>Last Name</label>
                <input className="ae-input" type="text" value={userData?.last_name || ""} onChange={(e) => setUserData({ ...userData, last_name: e.target.value })} />
              </div>
            </div>

            <div className="ae-row">
              <div className="ae-field">
                <label>Email</label>
                <input className="ae-input" type="email" value={userData?.email || ""} onChange={(e) => setUserData({ ...userData, email: e.target.value })} />
              </div>
              <div className="ae-field">
                <label>Phone</label>
                <input className="ae-input" type="tel" value={userData?.phone || ""} onChange={(e) => setUserData({ ...userData, phone: e.target.value })} />
              </div>
            </div>

            <div className="ae-field">
              <label>Resume (PDF)</label>
              <input className="ae-input" type="file" onChange={(e) => setUserData({ ...userData, resume: e.target.files?.[0] })} />
              <div className="ae-actions" style={{ marginTop: 8 }}>
                <button className="ae-btn" onClick={handleSubmit}>Save Profile</button>
                <button className="ae-btn ghost" onClick={downloadResume}>Download Current Resume</button>
              </div>
              <div className="ae-note">Uploading will re-embed your resume and update keywords in the DB.</div>
            </div>

            <div className="ae-field">
              <label>Links</label>
              {(userData?.urls || []).map((u, i) => (
                <div key={i} className="ae-row" style={{ marginBottom: 8 }}>
                  <input className="ae-input" placeholder="Type (e.g., linkedin, github)" value={u.type} onChange={(e) => {
                    const next = [...userData.urls]; next[i].type = e.target.value; setUserData({ ...userData, urls: next });
                  }} />
                  <input className="ae-input" placeholder="URL" value={u.url} onChange={(e) => {
                    const next = [...userData.urls]; next[i].url = e.target.value; setUserData({ ...userData, urls: next });
                  }} />
                </div>
              ))}
              <div className="ae-actions">
                <button className="ae-btn secondary" onClick={() => setUserData({ ...userData, urls: [...(userData?.urls || []), { type: "linkedin", url: "" }] })}>Add Link</button>
              </div>
            </div>
          </div>

          <div className="ae-card">
            <h3>Match Job Description</h3>
            <div className="ae-field">
              <label>Paste Job Description</label>
              <textarea className="ae-textarea" rows={10} placeholder="Paste job description here" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
            </div>
            <div className="ae-actions">
              <button className="ae-btn" onClick={handleMatch}>Compute Match</button>
            </div>
            {matchResult && (
              <div style={{ marginTop: 12 }}>
                <div className="ae-badge" style={{ marginBottom: 10 }}>Match {matchResult.percent}%</div>
                <div className="ae-field">
                  <label>Matching Keywords</label>
                  <div className="ae-chips">
                    {(matchResult.matchingWords || []).map((w, i) => (
                      <span className="ae-chip" key={`m-${i}`}>{w}</span>
                    ))}
                  </div>
                </div>
                <div className="ae-field">
                  <label>Missing Keywords</label>
                  <div className="ae-chips">
                    {(matchResult.missingWords || []).map((w, i) => (
                      <span className="ae-chip miss" key={`x-${i}`}>{w}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="ae-actions" style={{ marginTop: 10 }}>
              <button className="ae-btn secondary" onClick={handleTailored}>Generate Tailored CV</button>
              {tailored && (
                <>
                  <button className="ae-btn ghost" onClick={downloadTailored}>Download Tailored PDF</button>
                  <button className="ae-btn" onClick={async () => {
                    try {
                      await axiosInstance.post("/tailored_resume_pdf", { jobDescription, save: true }, { responseType: "blob" });
                      const r = await axiosInstance.get("/tailored_resumes");
                      setHistory(r.data.items || []);
                    } catch (e) { setTlError("Failed to save tailored CV"); }
                  }}>Save to History</button>
                </>
              )}
            </div>
            {tlError && <div className="ae-error">{tlError}</div>}
            {tailored && (
              <div className="ae-field" style={{ marginTop: 12 }}>
                <label>Tailored CV (Preview)</label>
                <pre className="ae-textarea" style={{ whiteSpace: "pre-wrap", maxHeight: 280, overflow: "auto" }}>{tailored}</pre>
              </div>
            )}
          </div>
        </div>

        <div className="ae-card" style={{ marginTop: 16 }}>
          <h3>Generate Custom Answer</h3>
          <div className="ae-row">
            <div className="ae-field" style={{ gridColumn: "1 / span 2" }}>
              <label>Application Question</label>
              <textarea className="ae-textarea" rows={4} placeholder="Describe a project..." value={appQuestion} onChange={(e) => setAppQuestion(e.target.value)} />
            </div>
          </div>
          <div className="ae-actions">
            <button className="ae-btn" onClick={handleCustomAnswer}>Generate Answer</button>
          </div>
          {answer && (
            <div className="ae-field" style={{ marginTop: 12 }}>
              <label>Answer</label>
              <pre className="ae-textarea" style={{ whiteSpace: "pre-wrap" }}>{answer}</pre>
            </div>
          )}
        </div>
      </div>
      <div className="ae-card" style={{ marginTop: 16 }}>
        <h3>Tailored CV History</h3>
        {history.length === 0 && <div className="ae-note">No tailored resumes saved yet.</div>}
        {history.map((h) => (
          <div key={h.id} className="ae-actions" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <div className="ae-note">{new Date(h.created_at).toLocaleString()}</div>
            <div className="ae-actions">
              <button className="ae-btn ghost" onClick={async () => {
                try {
                  const resp = await axiosInstance.get(`/tailored_resume_download?id=${encodeURIComponent(h.id)}`, { responseType: "blob" });
                  const blob = new Blob([resp.data], { type: resp.headers['content-type'] || "application/pdf" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = h.filename || 'tailored_resume.pdf'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                } catch (e) {}
              }}>Download</button>
              <button className="ae-btn" onClick={async () => {
                try { await axiosInstance.post('/use_tailored', { id: h.id }); } catch (e) { setTlError('Failed to set as current'); }
              }}>Set as Current</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;

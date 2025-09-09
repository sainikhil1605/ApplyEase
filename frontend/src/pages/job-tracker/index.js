import { useEffect, useState } from "react";
import axiosInstance from "../../utils/axiosInstance";
import "./job-tracker.css";

const emptyJob = { company: "", title: "", location: "", source: "", url: "", status: "saved", notes: "", jd_text: "", next_action_date: "" };

const StatusBadge = ({ s }) => {
  const colors = { saved: "#334155", applied: "#2563eb", interview: "#0ea5e9", offer: "#16a34a", rejected: "#ef4444" };
  return <span className="jt-badge" style={{ background: colors[s] || "#475569" }}>{s}</span>;
};

const JobTracker = () => {
  const [jobs, setJobs] = useState([]);
  const [draft, setDraft] = useState({ ...emptyJob });
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("board"); // board | list
  const [dragOverCol, setDragOverCol] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true); setErr("");
    try { const r = await axiosInstance.get("/jobs"); setJobs(r.data || []); } catch (e) { setErr("Failed to load jobs"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setErr("");
    try { await axiosInstance.post("/jobs", draft); setDraft({ ...emptyJob }); load(); } catch (e) { setErr("Failed to add job"); }
  };
  const update = async (id, patch) => {
    try { await axiosInstance.patch(`/jobs/${id}`, patch); load(); } catch {}
  };
  const remove = async (id) => { if (!window.confirm("Delete job?")) return; try { await axiosInstance.delete(`/jobs/${id}`); load(); } catch {} };
  const genCover = async (job) => {
    try {
      const resp = await axiosInstance.post("/cover_letters/generate", { company: job.company, title: job.title, job_url: job.url, save: true }, { responseType: "blob" });
      const blob = new Blob([resp.data], { type: resp.headers['content-type'] || "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `cover_${job.company || 'letter'}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setErr("Failed to generate cover letter"); }
  };

  const list = jobs.filter(j => filter === "all" ? true : j.status === filter);
  const statuses = ["saved", "applied", "interview", "offer", "rejected"];
  const onCardDragStart = (e, id) => {
    try { e.dataTransfer.effectAllowed = 'move'; } catch {}
    try { e.dataTransfer.setData('application/x-job-id', id); } catch {}
    try { e.dataTransfer.setData('text/plain', id); } catch {}
  };
  const getDragId = (e) => {
    try { return e.dataTransfer.getData('application/x-job-id') || e.dataTransfer.getData('text/plain') || ""; } catch { return ""; }
  };
  const onColDragOver = (e, s) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch {}
    setDragOverCol(s);
  };
  const onColDrop = (e, s) => {
    e.preventDefault();
    const id = getDragId(e);
    setDragOverCol(null);
    if (id) update(id, { status: s });
  };

  return (
    <div className="jt-page">
    <div className="jt-root">
      <div className="jt-header">
        <div className="jt-title">Job Tracker</div>
        <div className="jt-actions">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="jt-select">
            <option value="all">All</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className={`jt-btn ${view==='board' ? 'ghost' : ''}`} onClick={() => setView(view==='board'?'list':'board')}>{view==='board'?'List View':'Board View'}</button>
          <button className="jt-btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {err && <div className="jt-error">{err}</div>}

      <div className="jt-card">
        <div className="jt-card-title">Add Job</div>
        <div className="jt-grid">
          <input className="jt-input" placeholder="Company" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
          <input className="jt-input" placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input className="jt-input" placeholder="Location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          <input className="jt-input" placeholder="Source (e.g., LinkedIn)" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
          <input className="jt-input" placeholder="URL" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          <select className="jt-input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="jt-input" type="date" value={draft.next_action_date} onChange={(e) => setDraft({ ...draft, next_action_date: e.target.value })} />
          <textarea className="jt-textarea" rows={3} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
        <div className="jt-actions"><button className="jt-btn" onClick={create}>Add</button></div>
      </div>

      {view === 'board' ? (
        <div className="jt-board">
          {statuses.map((s) => (
            <div key={s} className={`jt-col ${dragOverCol===s ? 'over' : ''}`} 
                 onDragOver={(e) => onColDragOver(e, s)} 
                 onDragEnter={(e) => onColDragOver(e, s)} 
                 onDragLeave={() => setDragOverCol(null)} 
                 onDrop={(e) => onColDrop(e, s)}>
              <div className="jt-col-head"><span>{s}</span></div>
              <div className="jt-col-body" onDragOver={(e)=>onColDragOver(e, s)} onDrop={(e)=>onColDrop(e, s)}>
                {jobs.filter(j => j.status === s && (filter==='all' || j.status===filter)).map((j) => (
                  <div key={j.id} className="jt-card-mini" draggable onDragStart={(e) => onCardDragStart(e, j.id)}>
                    <div className="jt-card-mini-title">{j.title}</div>
                    <div className="jt-card-mini-sub">{j.company} {j.url && (<a href={j.url} onClick={(e)=>e.stopPropagation()} target="_blank" rel="noreferrer">↗</a>)}</div>
                    <div className="jt-card-mini-actions">
                      <button className="jt-btn ghost" onClick={(e)=>{e.stopPropagation(); genCover(j);}}>Cover</button>
                      <button className="jt-btn danger" onClick={(e)=>{e.stopPropagation(); remove(j.id);}}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="jt-list">
          {loading && <div className="jt-note">Loading...</div>}
          {list.map((j) => (
            <div key={j.id} className="jt-item" draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', j.id); }}>
              <div className="jt-item-main">
                <div className="jt-item-title">{j.title} <span className="jt-dash">—</span> {j.company}</div>
                <div className="jt-item-sub">{j.location} {j.url && (<a href={j.url} target="_blank" rel="noreferrer">↗</a>)} </div>
              </div>
              <div className="jt-item-right">
                <StatusBadge s={j.status} />
                <select className="jt-select small" value={j.status} onChange={(e) => update(j.id, { status: e.target.value })}>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="jt-btn ghost" onClick={() => genCover(j)}>Cover Letter</button>
                <button className="jt-btn danger" onClick={() => remove(j.id)}>Delete</button>
              </div>
              {j.notes && <div className="jt-notes">{j.notes}</div>}
            </div>
          ))}
          {list.length === 0 && !loading && <div className="jt-note">No jobs yet. Add one above.</div>}
        </div>
      )}
    </div>
    </div>
  );
};

export default JobTracker;

import { useEffect, useState } from "react";
import axiosInstance from "../../utils/axiosInstance";
import Layout from "../../components/Layout";
import "./job-tracker.css";

const emptyJob = { company: "", title: "", location: "", source: "", url: "", status: "saved", notes: "", jd_text: "", next_action_date: "" };

const StatusBadge = ({ status }) => {
  const config = {
    saved: { bg: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8', border: 'rgba(100, 116, 139, 0.4)' },
    applied: { bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' },
    interview: { bg: 'rgba(14, 165, 233, 0.2)', color: '#38bdf8', border: 'rgba(14, 165, 233, 0.4)' },
    offer: { bg: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.4)' },
    rejected: { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: 'rgba(239, 68, 68, 0.4)' },
  };
  const c = config[status] || config.saved;
  return <span className="status-badge" style={{ background: c.bg, color: c.color, borderColor: c.border }}>{status}</span>;
};

const JobTracker = () => {
  const [jobs, setJobs] = useState([]);
  const [draft, setDraft] = useState({ ...emptyJob });
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("board");
  const [dragOverCol, setDragOverCol] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await axiosInstance.get("/jobs");
      setJobs(r.data || []);
    } catch (e) {
      setErr("Failed to load jobs");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setErr("");
    try {
      await axiosInstance.post("/jobs", draft);
      setDraft({ ...emptyJob });
      setShowAddForm(false);
      load();
    } catch (e) {
      setErr("Failed to add job");
    }
  };

  const update = async (id, patch) => {
    try {
      await axiosInstance.patch(`/jobs/${id}`, patch);
      load();
    } catch {}
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this job?")) return;
    try {
      await axiosInstance.delete(`/jobs/${id}`);
      load();
    } catch {}
  };

  const genCover = async (job) => {
    try {
      const resp = await axiosInstance.post("/cover_letters/generate", 
        { company: job.company, title: job.title, job_url: job.url, save: true }, 
        { responseType: "blob" }
      );
      const blob = new Blob([resp.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cover_${job.company || 'letter'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr("Failed to generate cover letter");
    }
  };

  const statuses = ["saved", "applied", "interview", "offer", "rejected"];
  const list = jobs.filter(j => filter === "all" || j.status === filter);

  const onCardDragStart = (e, id) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const onColDragOver = (e, s) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(s);
  };

  const onColDrop = (e, s) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDragOverCol(null);
    if (id) update(id, { status: s });
  };

  // Stats
  const stats = {
    total: jobs.length,
    applied: jobs.filter(j => j.status === 'applied').length,
    interview: jobs.filter(j => j.status === 'interview').length,
    offer: jobs.filter(j => j.status === 'offer').length,
  };

  return (
    <Layout title="Job Tracker">
      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total Jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.applied}</div>
          <div className="stat-label">Applied</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.interview}</div>
          <div className="stat-label">Interviews</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.offer}</div>
          <div className="stat-label">Offers</div>
        </div>
      </div>

      {/* Controls */}
      <div className="controls-row">
        <div className="btn-group">
          <button className={`btn ${view === 'board' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('board')}>
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/></svg>
            Board
          </button>
          <button className={`btn ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('list')}>
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            List
          </button>
        </div>
        <div className="btn-group">
          <select className="form-select" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="all">All Status</option>
            {statuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? '✕ Cancel' : '+ Add Job'}
          </button>
          <button className="btn btn-ghost" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {err && <div className="message message-error">{err}</div>}

      {/* Add Job Form */}
      {showAddForm && (
        <div className="glass-card add-job-form">
          <h3>Add New Job</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Company</label>
              <input className="form-input" placeholder="Company name" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Job Title</label>
              <input className="form-input" placeholder="Position title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-input" placeholder="City, State" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Source</label>
              <input className="form-input" placeholder="LinkedIn, Indeed, etc." value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Job URL</label>
              <input className="form-input" placeholder="https://..." value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                {statuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" rows={2} placeholder="Any notes..." value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={create}>Add Job</button>
            <button className="btn btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Board View */}
      {view === 'board' && (
        <div className="kanban-board">
          {statuses.map((status) => (
            <div 
              key={status} 
              className={`kanban-column ${dragOverCol === status ? 'drag-over' : ''}`}
              onDragOver={(e) => onColDragOver(e, status)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => onColDrop(e, status)}
            >
              <div className="column-header">
                <span className="column-title">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                <span className="column-count">{jobs.filter(j => j.status === status).length}</span>
              </div>
              <div className="column-body">
                {jobs.filter(j => j.status === status).map((job) => (
                  <div 
                    key={job.id} 
                    className="job-card" 
                    draggable 
                    onDragStart={(e) => onCardDragStart(e, job.id)}
                  >
                    <div className="job-card-title">{job.title}</div>
                    <div className="job-card-company">{job.company}</div>
                    {job.location && <div className="job-card-location">📍 {job.location}</div>}
                    <div className="job-card-actions">
                      {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="btn btn-ghost">🔗</a>}
                      <button className="btn btn-ghost" onClick={() => genCover(job)}>📄</button>
                      <button className="btn btn-danger" onClick={() => remove(job.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="glass-card">
          {loading && <div className="text-muted">Loading...</div>}
          {list.length === 0 && !loading && <div className="text-muted">No jobs yet. Add one above.</div>}
          {list.map((job) => (
            <div key={job.id} className="job-list-item">
              <div className="job-list-main">
                <div className="job-list-title">{job.title}</div>
                <div className="job-list-company">{job.company} {job.location && `• ${job.location}`}</div>
              </div>
              <div className="job-list-actions">
                <StatusBadge status={job.status} />
                <select className="form-select" value={job.status} onChange={(e) => update(job.id, { status: e.target.value })} style={{ width: 'auto' }}>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="btn btn-ghost">🔗 Open</a>}
                <button className="btn btn-ghost" onClick={() => genCover(job)}>📄 Cover</button>
                <button className="btn btn-danger" onClick={() => remove(job.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
};

export default JobTracker;

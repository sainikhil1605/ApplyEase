import { NavLink, useNavigate, useLocation } from "react-router-dom";
import "./Layout.css";

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

// NavLink className helper — keeps it DRY
const navClass = ({ isActive }) => `nav-item${isActive ? " active" : ""}`;

// Cover Letters needs a special active check because it navigates to
// /dashboard?tab=tools, which NavLink's isActive won't match with
// query-string equality. We check pathname + tab param manually.
const CoverLettersLink = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive =
    location.pathname === "/dashboard" &&
    new URLSearchParams(location.search).get("tab") === "tools";

  return (
    <button
      className={`nav-item${isActive ? " active" : ""}`}
      onClick={() => navigate("/dashboard?tab=tools")}
      style={{ background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
        <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <span>AI Tools</span>
    </button>
  );
};

// -------------------------------------------------------
// Layout
// -------------------------------------------------------
const Layout = ({ children, title }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    // Fire storage event so ProtectedRoute in the same tab reacts
    window.dispatchEvent(new StorageEvent("storage", { key: "token", newValue: null }));
    navigate("/login");
  };

  return (
    <div className="layout">
      {/* Animated Background */}
      <div className="layout-bg">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="logo-text">ApplyEase</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <span className="nav-section-title">Main</span>

            {/* Dashboard — active on /dashboard regardless of ?tab */}
            <NavLink
              to="/dashboard"
              end
              className={({ isActive }) => {
                // Also mark active when on /dashboard with any tab param
                const loc = window.location;
                const onDashboard = loc.pathname === "/dashboard";
                return `nav-item${(isActive || onDashboard) ? " active" : ""}`;
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <span>Dashboard</span>
            </NavLink>

            <NavLink to="/job-tracker" className={navClass}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5C15 6.10457 14.1046 7 13 7H11C9.89543 7 9 6.10457 9 5Z" stroke="currentColor" strokeWidth="2"/>
                <path d="M9 12H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M9 16H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>Job Tracker</span>
            </NavLink>
          </div>

          <div className="nav-section">
            <span className="nav-section-title">Tools</span>
            <CoverLettersLink />
          </div>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 17L21 12L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="main-header">
          <div className="header-left">
            <h1 className="page-title">{title}</h1>
          </div>
          <div className="header-right">
            <div className="user-badge">
              <div className="user-avatar">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/>
                  <path d="M4 21C4 17.134 7.58172 14 12 14C16.4183 14 20 17.134 20 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          </div>
        </header>

        <div className="content-area">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;

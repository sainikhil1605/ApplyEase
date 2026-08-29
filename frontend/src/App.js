import "./App.css";
import "./styles/shared.css";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  useNavigate,
} from "react-router-dom";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import JobTracker from "./pages/job-tracker";
import { useEffect, useState } from "react";

// -------------------------------------------------------
// ProtectedRoute
// – reads token from state so it re-evaluates reactively
// – shows a brief loading screen instead of a flash
// – listens to storage events so cross-tab logout works
// -------------------------------------------------------
const ProtectedRoute = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setToken(localStorage.getItem("token"));
    setChecking(false);

    // React to external token removal (other tabs, interceptor, etc.)
    const onStorage = (e) => {
      if (e.key === "token") setToken(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f0c29 0%, #1a1a2e 50%, #16213e 100%)",
        }}
      >
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// -------------------------------------------------------
// NotFound – catch-all 404 page
// -------------------------------------------------------
const NotFound = () => {
  const navigate = useNavigate();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f0c29 0%, #1a1a2e 50%, #16213e 100%)",
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
        gap: 16,
      }}
    >
      <div style={{ fontSize: 72, fontWeight: 800, color: "#667eea" }}>404</div>
      <div style={{ fontSize: 20, color: "#94a3b8" }}>Page not found</div>
      <button
        onClick={() => navigate("/dashboard")}
        style={{
          marginTop: 8,
          padding: "12px 24px",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "#fff",
          border: "none",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Go to Dashboard
      </button>
    </div>
  );
};

// -------------------------------------------------------
// Router – defined inside the module but NOT at top level
// so ProtectedRoute can be a proper component reference
// -------------------------------------------------------
const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  { path: "/login", element: <Login /> },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/job-tracker",
    element: (
      <ProtectedRoute>
        <JobTracker />
      </ProtectedRoute>
    ),
  },
  // Catch-all 404
  { path: "*", element: <NotFound /> },
]);

function App() {
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      window.postMessage({ source: "applyease", action: "AddToken", token }, "*");
    }
  }, []);

  return <RouterProvider router={router} />;
}

export default App;

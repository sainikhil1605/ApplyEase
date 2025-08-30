/* eslint-disable no-undef */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../utils/axiosInstance";
import "./Login.css";
import { useEffect } from "react";

const Login = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // shared
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordStrength = (pwd) => {
    let score = 0;
    if (!pwd) return 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return Math.min(score, 4);
  };

  // signup-only
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");

  const persistToken = (token) => {
    localStorage.setItem("token", token);
    try {
      if (window.chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage("hdihofgbikbakkcghaaobjkcjphlmdfb", {
          action: "AddToken",
          token,
        });
      }
    } catch (e) {
      console.warn("Extension token send failed", e);
    }
    try {
      window.postMessage({ source: "applyease", action: "AddToken", token }, "*");
    } catch {}
  };

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const resp = await axiosInstance.post("/login", { email, password });
      if (resp.data.token) {
        persistToken(resp.data.token);
        navigate("/dashboard");
      }
    } catch (e) {
      setError(e?.response?.data?.detail || e?.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    setError("");
    if (!firstName || !lastName) return setError("Please enter your first and last name.");
    if (!email || !password) return setError("Please enter email and password.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const resp = await axiosInstance.post("/signup", {
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        phone,
        location,
      });
      if (resp.data.token) {
        persistToken(resp.data.token);
        navigate("/dashboard");
      }
    } catch (e) {
      setError(e?.response?.data?.detail || e?.response?.data?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const onEnter = (e) => {
    if (e.key === "Enter") {
      mode === "login" ? handleLogin() : handleSignup();
    }
  };

  // Redirect if already authenticated
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) navigate("/dashboard");
  }, [navigate]);

  return (
    <div className="ae-auth">
      <div className="ae-auth-card">
        <div className="ae-auth-head">
          <img src="/icon2.png" alt="ApplyEase" className="ae-auth-logo" />
          <div className="ae-auth-title">ApplyEase</div>
        </div>
        <div className="ae-tabs">
          <div className={`ae-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Login</div>
          <div className={`ae-tab ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>Sign Up</div>
        </div>

        {mode === "signup" && (
          <div className="ae-row">
            <div className="ae-field">
              <label>First Name</label>
              <input className="ae-input" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} onKeyDown={onEnter} />
            </div>
            <div className="ae-field">
              <label>Last Name</label>
              <input className="ae-input" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} onKeyDown={onEnter} />
            </div>
          </div>
        )}

        <div className="ae-field">
          <label>Email</label>
          <input className="ae-input" type="email" placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter} />
        </div>
        <div className="ae-field">
          <label>Password</label>
          <input className="ae-input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter} />
          {mode === "signup" && (
            <div style={{ marginTop: 6 }}>
              <div style={{ height: 6, background: "#0a0f1e", borderRadius: 999 }}>
                <div style={{ height: 6, width: `${(passwordStrength(password) / 4) * 100}%`, background: "#0d9488", borderRadius: 999 }} />
              </div>
              <div className="ae-note">Use 8+ chars with upper, lower, number, symbol.</div>
            </div>
          )}
        </div>

        {mode === "signup" && (
          <>
            <div className="ae-row">
              <div className="ae-field">
                <label>Phone (optional)</label>
                <input className="ae-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="ae-field">
                <label>Location (optional)</label>
                <input className="ae-input" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            </div>
            <div className="ae-field">
              <label>Confirm Password</label>
              <input className="ae-input" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={onEnter} />
            </div>
          </>
        )}

        <div className="ae-error">{error}</div>
        <div className="ae-actions">
          <div className="ae-link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Create an account" : "Have an account? Login"}
          </div>
          <button className="ae-btn" disabled={loading} onClick={mode === "login" ? handleLogin : handleSignup}>
            {loading ? (mode === "login" ? "Signing in..." : "Creating...") : mode === "login" ? "Login" : "Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;

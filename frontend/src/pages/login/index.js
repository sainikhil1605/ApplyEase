/* eslint-disable no-undef */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../utils/axiosInstance";
const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const resp = await axiosInstance.post("/login", { email, password });
      if (resp.data.token) {
        // Persist token for axiosInstance
        localStorage.setItem("token", resp.data.token);
        // Notify extension (if ID is correct and extension installed)
        try {
          if (window.chrome?.runtime?.sendMessage) {
            chrome.runtime.sendMessage("hdihofgbikbakkcghaaobjkcjphlmdfb", {
              action: "AddToken",
              token: resp.data.token,
            });
          }
        } catch (e) {
          console.warn("Extension token send failed", e);
        }
        // Fallback channel: broadcast to content scripts via window.postMessage
        try {
          window.postMessage(
            { source: "applyease", action: "AddToken", token: resp.data.token },
            "*"
          );
        } catch {}
        navigate("/dashboard");
      }
    } catch (e) {
      setError(e?.response?.data?.detail || e?.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <div>
        <label>Email</label>
        <input
          type="email"
          placeholder="Enter Email"
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label>Password</label>
        <input
          type="password"
          placeholder="Enter Password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
      <button id="submitButton" disabled={loading} onClick={() => handleSubmit()}>
        {loading ? "Signing in..." : "Submit"}
      </button>
    </div>
  );
};
export default Login;

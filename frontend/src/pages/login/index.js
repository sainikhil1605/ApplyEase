/* eslint-disable no-undef */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const handleSubmit = async () => {
    const resp = await axios.post("http://localhost:5000/login", {
      email,
      password,
    });
    if (resp.data.token) {
      chrome.runtime.sendMessage("hdihofgbikbakkcghaaobjkcjphlmdfb", {
        action: "AddToken",
        token: resp.data.token,
      });
      navigate("/dashboard");
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
      <button id="submitButton" onClick={() => handleSubmit()}>
        Submit
      </button>
    </div>
  );
};
export default Login;

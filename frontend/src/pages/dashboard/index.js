/* eslint-disable no-undef */
import { useEffect, useState } from "react";
import axiosInstance from "../../utils/axiosInstance";
const Dashboard = () => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [matchResult, setMatchResult] = useState(null);
  const [appQuestion, setAppQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  console.log(userData);
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
  }, []);
  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    const formData = new FormData();
    formData.append("resume", userData.resume);
    formData.append("first_name", userData.first_name);
    formData.append("last_name", userData.last_name);
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
  return (
    <div>
      <div>Dashboard</div>
      {loading && <div>Loading...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}
      <div>
        <label>Resume</label>
        <input
          type="file"
          onChange={(e) =>
            setUserData({ ...userData, resume: e.target.files[0] })
          }
        />
      </div>
      <div>
        <label>First Name</label>
        <input
          type="text"
          value={userData?.first_name}
          onChange={(e) =>
            setUserData({ ...userData, first_name: e.target.value })
          }
        />
      </div>
      <div>
        <label>Last Name</label>
        <input
          type="text"
          value={userData?.last_name}
          onChange={(e) =>
            setUserData({ ...userData, last_name: e.target.value })
          }
        />
      </div>
      <div>
        {userData?.urls?.map((url, index) => {
          return (
            <div key={index}>
              <label>{url.type}</label>
              <input
                type="text"
                value={url.url}
                onChange={(e) => {
                  const newUrls = userData.urls;
                  newUrls[index].url = e.target.value;
                  setUserData({ ...userData, urls: [...newUrls] });
                }}
              />
            </div>
          );
        })}
      </div>
      <div>
        EEO fields
        <div>
          <label>Gender</label>
          <select>
            <options value="Male">Male</options>
            <options value="Female">Female</options>
            <option value="Decline to self-identify">
              Decline to self-indentify
            </option>
          </select>
        </div>
      </div>
      <div>
        <button onClick={() => handleSubmit()}>Submit</button>
      </div>
      <hr />
      <div>
        <h3>Match Job Description</h3>
        <textarea
          placeholder="Paste job description"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={6}
          cols={80}
        />
        <div>
          <button onClick={handleMatch}>Compute Match</button>
        </div>
        {matchResult && (
          <div>
            <div>Match: {matchResult.percent}%</div>
            <div>
              Matching: {(matchResult.matchingWords || []).join(", ")}
            </div>
            <div>
              Missing: {(matchResult.missingWords || []).join(", ")}
            </div>
          </div>
        )}
      </div>
      <hr />
      <div>
        <h3>Generate Custom Answer</h3>
        <textarea
          placeholder="Application question"
          value={appQuestion}
          onChange={(e) => setAppQuestion(e.target.value)}
          rows={3}
          cols={80}
        />
        <div>
          <button onClick={handleCustomAnswer}>Generate Answer</button>
        </div>
        {answer && (
          <div>
            <h4>Answer</h4>
            <pre>{answer}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

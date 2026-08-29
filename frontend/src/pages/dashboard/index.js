import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import axiosInstance from "../../utils/axiosInstance";
import Layout from "../../components/Layout";
import "./Dashboard.css";

const Dashboard = () => {
  const [searchParams] = useSearchParams();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [matchResult, setMatchResult] = useState(null);
  const [appQuestion, setAppQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tailored, setTailored] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractedPreview, setExtractedPreview] = useState(null);
  const [activeTab, setActiveTab] = useState("personal");

  const loadUserData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get("/user");
      setUserData(response.data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to load user data");
    } finally {
      setLoading(false);
    }
  }, []); // stable — no deps change this function

  // Sync URL params to state — runs when query string changes
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) setActiveTab(tabParam);
    const jdParam = searchParams.get("jd");
    if (jdParam) {
      setJobDescription(jdParam);
      setActiveTab("tools");
    }
  }, [searchParams]);

  // Load user data exactly once on mount
  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const handleExtractProfile = async () => {
    setExtracting(true);
    setError("");
    try {
      const resp = await axiosInstance.post("/extract_profile");
      setExtractedPreview(resp.data.extracted);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to extract profile");
    } finally {
      setExtracting(false);
    }
  };

  const handleApplyExtracted = async (merge = true) => {
    if (!extractedPreview) return;
    setLoading(true);
    try {
      await axiosInstance.post("/apply_extracted_profile", { extracted: extractedPreview, merge });
      await loadUserData();
      setExtractedPreview(null);
      setSuccess("Profile updated with extracted data!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to apply extracted data");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    const formData = new FormData();
    
    if (userData?.resume instanceof File) {
      formData.append("resume", userData.resume);
    }
    
    // All string fields
    const stringFields = [
      "first_name", "last_name", "email", "phone", "location",
      "address_line1", "address_line2", "city", "state", "country", "zip_code",
      "current_company", "desired_salary", "notice_period", "relocation", "available_start_date",
      "date_of_birth", "nationality", "gender", "pronouns",
      "work_authorization", "visa_type", "visa_expiry", "requires_sponsorship", "legally_authorized",
      "years_of_experience", "current_salary", "salary_currency", "employment_type", "remote_preference",
      "hear_about_us", "applied_before", "worked_here_before", "has_relatives_here",
      "linkedin_url", "github_url", "portfolio_url", "website_url",
      "security_clearance", "willing_to_travel", "has_drivers_license", "has_vehicle",
      "disability_status", "veteran_status",
      "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship"
    ];
    
    stringFields.forEach(field => {
      if (userData?.[field]) formData.append(field, userData[field]);
    });
    
    // JSON array fields
    ["urls", "work_experience", "education", "skills", "certifications", "languages"].forEach(field => {
      if (Array.isArray(userData?.[field])) {
        formData.append(field, JSON.stringify(userData[field]));
      }
    });

    try {
      await axiosInstance.patch("/user", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSuccess("Profile saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to save profile");
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
      setError("Failed to compute match");
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
      setError("Failed to generate answer");
    }
  };

  const handleTailored = async () => {
    if (!jobDescription.trim()) return setError("Paste a job description first.");
    try {
      const resp = await axiosInstance.post("/tailored_resume", { jobDescription, save: false });
      setTailored(resp.data.resume_text || "");
    } catch (e) {
      setError("Failed to generate tailored CV");
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!jobDescription.trim()) return setError("Paste a job description first.");
    try {
      const resp = await axiosInstance.post("/cover_letters/generate", 
        { job_description: jobDescription, filename: "cover_letter.pdf", save: true, use_llm: true }, 
        { responseType: "blob" }
      );
      const blob = new Blob([resp.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cover_letter.pdf";
      a.click();
      URL.revokeObjectURL(url);
      setSuccess("Cover letter generated!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError("Failed to generate cover letter");
    }
  };

  const downloadResume = async () => {
    try {
      const token = localStorage.getItem("token");
      const base = process.env.REACT_APP_API_BASE || "http://localhost:8000";
      let res = await fetch(`${base}/resume_file`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) res = await fetch(`${base}/resume_pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "resume.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {}
  };

  const downloadTailored = async () => {
    if (!tailored.trim()) return;
    try {
      const resp = await axiosInstance.post("/render_pdf", { text: tailored, filename: "tailored_resume.pdf" }, { responseType: "blob" });
      const blob = new Blob([resp.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "tailored_resume.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError("Failed to download PDF"); }
  };

  const updateField = (field, value) => setUserData(prev => ({ ...prev, [field]: value }));

  const updateArrayItem = (arrayName, index, field, value) => {
    const arr = [...(userData?.[arrayName] || [])];
    arr[index] = { ...arr[index], [field]: value };
    setUserData(prev => ({ ...prev, [arrayName]: arr }));
  };

  const addArrayItem = (arrayName, template) => {
    setUserData(prev => ({ ...prev, [arrayName]: [...(prev?.[arrayName] || []), template] }));
  };

  const removeArrayItem = (arrayName, index) => {
    setUserData(prev => ({ ...prev, [arrayName]: prev[arrayName].filter((_, i) => i !== index) }));
  };

  const tabs = [
    { id: "personal", label: "Personal", icon: "👤" },
    { id: "work", label: "Work Auth", icon: "📋" },
    { id: "experience", label: "Experience", icon: "💼" },
    { id: "education", label: "Education", icon: "🎓" },
    { id: "links", label: "Links & Resume", icon: "🔗" },
    { id: "screening", label: "Screening", icon: "✅" },
    { id: "tools", label: "AI Tools", icon: "🤖" },
  ];

  return (
    <Layout title="Profile Dashboard">
      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}
      {loading && <div className="message message-info">Loading...</div>}

      {/* Tab Navigation */}
      <div className="tab-nav">
        {tabs.map(tab => (
          <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Personal Tab */}
      {activeTab === 'personal' && (
        <div className="dashboard-grid">
          <div className="glass-card">
            <h3>Basic Information</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input className="form-input" value={userData?.first_name || ""} onChange={(e) => updateField('first_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input className="form-input" value={userData?.last_name || ""} onChange={(e) => updateField('last_name', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={userData?.email || ""} onChange={(e) => updateField('email', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" type="tel" value={userData?.phone || ""} onChange={(e) => updateField('phone', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input className="form-input" type="date" value={userData?.date_of_birth || ""} onChange={(e) => updateField('date_of_birth', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Nationality</label>
                <input className="form-input" placeholder="e.g., Indian, American" value={userData?.nationality || ""} onChange={(e) => updateField('nationality', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Gender</label>
                <select className="form-select" value={userData?.gender || ""} onChange={(e) => updateField('gender', e.target.value)}>
                  <option value="">Prefer not to say</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Pronouns</label>
                <select className="form-select" value={userData?.pronouns || ""} onChange={(e) => updateField('pronouns', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="He/Him">He/Him</option>
                  <option value="She/Her">She/Her</option>
                  <option value="They/Them">They/Them</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="glass-card">
            <h3>Address</h3>
            <div className="form-group">
              <label className="form-label">Address Line 1</label>
              <input className="form-input" value={userData?.address_line1 || ""} onChange={(e) => updateField('address_line1', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Address Line 2</label>
              <input className="form-input" value={userData?.address_line2 || ""} onChange={(e) => updateField('address_line2', e.target.value)} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">City</label>
                <input className="form-input" value={userData?.city || ""} onChange={(e) => updateField('city', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">State/Province</label>
                <input className="form-input" value={userData?.state || ""} onChange={(e) => updateField('state', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Country</label>
                <input className="form-input" value={userData?.country || ""} onChange={(e) => updateField('country', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Zip/Postal Code</label>
                <input className="form-input" value={userData?.zip_code || ""} onChange={(e) => updateField('zip_code', e.target.value)} />
              </div>
            </div>

            <h4>Emergency Contact</h4>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Contact Name</label>
                <input className="form-input" value={userData?.emergency_contact_name || ""} onChange={(e) => updateField('emergency_contact_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Phone</label>
                <input className="form-input" type="tel" value={userData?.emergency_contact_phone || ""} onChange={(e) => updateField('emergency_contact_phone', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Relationship</label>
              <input className="form-input" placeholder="e.g., Spouse, Parent, Friend" value={userData?.emergency_contact_relationship || ""} onChange={(e) => updateField('emergency_contact_relationship', e.target.value)} />
            </div>

            <div className="btn-group mt-2">
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>💾 Save Personal Info</button>
            </div>
          </div>
        </div>
      )}

      {/* Work Authorization Tab */}
      {activeTab === 'work' && (
        <div className="dashboard-grid">
          <div className="glass-card">
            <h3>Work Authorization</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Authorization Status</label>
                <select className="form-select" value={userData?.work_authorization || ""} onChange={(e) => updateField('work_authorization', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="Citizen">Citizen</option>
                  <option value="Permanent Resident">Permanent Resident / Green Card</option>
                  <option value="Work Visa">Work Visa</option>
                  <option value="Student Visa">Student Visa (F1/J1)</option>
                  <option value="OPT">OPT (Optional Practical Training)</option>
                  <option value="CPT">CPT (Curricular Practical Training)</option>
                  <option value="EAD">EAD (Employment Authorization Document)</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Visa Type (if applicable)</label>
                <select className="form-select" value={userData?.visa_type || ""} onChange={(e) => updateField('visa_type', e.target.value)}>
                  <option value="">Not Applicable</option>
                  <option value="H1B">H1B</option>
                  <option value="L1">L1</option>
                  <option value="O1">O1</option>
                  <option value="TN">TN</option>
                  <option value="E2">E2</option>
                  <option value="F1">F1</option>
                  <option value="J1">J1</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Visa Expiry Date</label>
                <input className="form-input" type="date" value={userData?.visa_expiry || ""} onChange={(e) => updateField('visa_expiry', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Requires Sponsorship?</label>
                <select className="form-select" value={userData?.requires_sponsorship || ""} onChange={(e) => updateField('requires_sponsorship', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                  <option value="Yes - Now">Yes - Now</option>
                  <option value="Yes - Future">Yes - In the Future</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Legally Authorized to Work?</label>
              <select className="form-select" value={userData?.legally_authorized || ""} onChange={(e) => updateField('legally_authorized', e.target.value)}>
                <option value="">Select...</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>

          <div className="glass-card">
            <h3>Employment Preferences</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Current Company</label>
                <input className="form-input" value={userData?.current_company || ""} onChange={(e) => updateField('current_company', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Years of Experience</label>
                <select className="form-select" value={userData?.years_of_experience || ""} onChange={(e) => updateField('years_of_experience', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="0-1">0-1 years</option>
                  <option value="1-2">1-2 years</option>
                  <option value="2-3">2-3 years</option>
                  <option value="3-5">3-5 years</option>
                  <option value="5-7">5-7 years</option>
                  <option value="7-10">7-10 years</option>
                  <option value="10-15">10-15 years</option>
                  <option value="15+">15+ years</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Current Salary</label>
                <input className="form-input" placeholder="e.g., 75000" value={userData?.current_salary || ""} onChange={(e) => updateField('current_salary', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Desired Salary</label>
                <input className="form-input" placeholder="e.g., 90000" value={userData?.desired_salary || ""} onChange={(e) => updateField('desired_salary', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Salary Currency</label>
                <select className="form-select" value={userData?.salary_currency || ""} onChange={(e) => updateField('salary_currency', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="CAD">CAD (C$)</option>
                  <option value="AUD">AUD (A$)</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notice Period</label>
                <select className="form-select" value={userData?.notice_period || ""} onChange={(e) => updateField('notice_period', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="Immediately Available">Immediately Available</option>
                  <option value="0-15 Days">0-15 Days</option>
                  <option value="15-30 Days">15-30 Days</option>
                  <option value="30-45 Days">30-45 Days</option>
                  <option value="45-60 Days">45-60 Days</option>
                  <option value="60-90 Days">60-90 Days</option>
                  <option value="Currently Serving">Currently Serving Notice</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Employment Type Preference</label>
                <select className="form-select" value={userData?.employment_type || ""} onChange={(e) => updateField('employment_type', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Internship">Internship</option>
                  <option value="Freelance">Freelance</option>
                  <option value="Any">Open to All</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Remote Preference</label>
                <select className="form-select" value={userData?.remote_preference || ""} onChange={(e) => updateField('remote_preference', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="Remote">Remote Only</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="On-site">On-site</option>
                  <option value="Flexible">Flexible</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Open to Relocation?</label>
                <select className="form-select" value={userData?.relocation || ""} onChange={(e) => updateField('relocation', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                  <option value="Yes, within country">Yes, within country</option>
                  <option value="Yes, internationally">Yes, internationally</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Available Start Date</label>
                <input className="form-input" type="date" value={userData?.available_start_date || ""} onChange={(e) => updateField('available_start_date', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Willing to Travel?</label>
              <select className="form-select" value={userData?.willing_to_travel || ""} onChange={(e) => updateField('willing_to_travel', e.target.value)}>
                <option value="">Select...</option>
                <option value="No">No</option>
                <option value="0-25%">0-25%</option>
                <option value="25-50%">25-50%</option>
                <option value="50-75%">50-75%</option>
                <option value="75-100%">75-100%</option>
              </select>
            </div>
            <div className="btn-group mt-2">
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>💾 Save Work Info</button>
            </div>
          </div>
        </div>
      )}

      {/* Experience Tab */}
      {activeTab === 'experience' && (
        <div className="dashboard-grid">
          <div className="glass-card">
            <h3>Work Experience</h3>
            {(userData?.work_experience || []).map((exp, i) => (
              <div key={i} className="entry-card">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Position/Title</label>
                    <input className="form-input" value={exp.position || ""} onChange={(e) => updateArrayItem('work_experience', i, 'position', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Company/Organization</label>
                    <input className="form-input" value={exp.company || ""} onChange={(e) => updateArrayItem('work_experience', i, 'company', e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input className="form-input" placeholder="MM/YYYY" value={exp.start_date || ""} onChange={(e) => updateArrayItem('work_experience', i, 'start_date', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Date</label>
                    <input className="form-input" placeholder="MM/YYYY or Current" value={exp.end_date || ""} onChange={(e) => updateArrayItem('work_experience', i, 'end_date', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input className="form-input" placeholder="City, Country" value={exp.location || ""} onChange={(e) => updateArrayItem('work_experience', i, 'location', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Description/Responsibilities</label>
                  <textarea className="form-textarea" rows={3} value={exp.details || ""} onChange={(e) => updateArrayItem('work_experience', i, 'details', e.target.value)} />
                </div>
                <button className="btn btn-danger" onClick={() => removeArrayItem('work_experience', i)}>Remove</button>
              </div>
            ))}
            <button className="btn btn-secondary" onClick={() => addArrayItem('work_experience', { position: '', company: '', start_date: '', end_date: '', location: '', details: '' })}>+ Add Experience</button>
            <div className="btn-group mt-2">
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>💾 Save Experience</button>
            </div>
          </div>

          <div className="glass-card">
            <h3>Skills</h3>
            {(userData?.skills || []).map((skill, i) => (
              <div key={i} className="form-row mb-1">
                <input className="form-input" placeholder="Skill name (e.g., Python, React)" value={skill.name || ""} onChange={(e) => updateArrayItem('skills', i, 'name', e.target.value)} />
                <select className="form-select" value={skill.proficiency || ""} onChange={(e) => updateArrayItem('skills', i, 'proficiency', e.target.value)}>
                  <option value="">Proficiency</option>
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                  <option value="Expert">Expert</option>
                </select>
                <button className="btn btn-ghost" onClick={() => removeArrayItem('skills', i)}>✕</button>
              </div>
            ))}
            <button className="btn btn-secondary mt-1" onClick={() => addArrayItem('skills', { name: '', proficiency: '' })}>+ Add Skill</button>

            <h4>Languages</h4>
            {(userData?.languages || []).map((lang, i) => (
              <div key={i} className="form-row mb-1">
                <input className="form-input" placeholder="Language (e.g., English, Hindi)" value={lang.name || ""} onChange={(e) => updateArrayItem('languages', i, 'name', e.target.value)} />
                <select className="form-select" value={lang.proficiency || ""} onChange={(e) => updateArrayItem('languages', i, 'proficiency', e.target.value)}>
                  <option value="">Proficiency</option>
                  <option value="Basic">Basic</option>
                  <option value="Conversational">Conversational</option>
                  <option value="Professional">Professional</option>
                  <option value="Fluent">Fluent</option>
                  <option value="Native">Native</option>
                </select>
                <button className="btn btn-ghost" onClick={() => removeArrayItem('languages', i)}>✕</button>
              </div>
            ))}
            <button className="btn btn-secondary mt-1" onClick={() => addArrayItem('languages', { name: '', proficiency: '' })}>+ Add Language</button>
            <div className="btn-group mt-2">
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>💾 Save Skills</button>
            </div>
          </div>
        </div>
      )}

      {/* Education Tab */}
      {activeTab === 'education' && (
        <div className="dashboard-grid">
          <div className="glass-card">
            <h3>Education</h3>
            {(userData?.education || []).map((edu, i) => (
              <div key={i} className="entry-card">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Degree</label>
                    <input className="form-input" placeholder="e.g., Bachelor's, Master's" value={edu.degree || ""} onChange={(e) => updateArrayItem('education', i, 'degree', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Major/Field of Study</label>
                    <input className="form-input" value={edu.major || ""} onChange={(e) => updateArrayItem('education', i, 'major', e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Institution</label>
                    <input className="form-input" value={edu.institution || ""} onChange={(e) => updateArrayItem('education', i, 'institution', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Graduation Date</label>
                    <input className="form-input" placeholder="MM/YYYY" value={edu.graduation_date || ""} onChange={(e) => updateArrayItem('education', i, 'graduation_date', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">GPA (optional)</label>
                  <input className="form-input" placeholder="e.g., 3.8/4.0" value={edu.gpa || ""} onChange={(e) => updateArrayItem('education', i, 'gpa', e.target.value)} />
                </div>
                <button className="btn btn-danger" onClick={() => removeArrayItem('education', i)}>Remove</button>
              </div>
            ))}
            <button className="btn btn-secondary" onClick={() => addArrayItem('education', { degree: '', major: '', institution: '', graduation_date: '', gpa: '' })}>+ Add Education</button>
          </div>

          <div className="glass-card">
            <h3>Certifications & Licenses</h3>
            {(userData?.certifications || []).map((cert, i) => (
              <div key={i} className="entry-card">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Certification Name</label>
                    <input className="form-input" value={cert.name || ""} onChange={(e) => updateArrayItem('certifications', i, 'name', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Issuing Organization</label>
                    <input className="form-input" value={cert.issuer || ""} onChange={(e) => updateArrayItem('certifications', i, 'issuer', e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Issue Date</label>
                    <input className="form-input" placeholder="MM/YYYY" value={cert.issue_date || ""} onChange={(e) => updateArrayItem('certifications', i, 'issue_date', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Expiry Date (if applicable)</label>
                    <input className="form-input" placeholder="MM/YYYY or N/A" value={cert.expiry_date || ""} onChange={(e) => updateArrayItem('certifications', i, 'expiry_date', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Credential ID (optional)</label>
                  <input className="form-input" value={cert.credential_id || ""} onChange={(e) => updateArrayItem('certifications', i, 'credential_id', e.target.value)} />
                </div>
                <button className="btn btn-danger" onClick={() => removeArrayItem('certifications', i)}>Remove</button>
              </div>
            ))}
            <button className="btn btn-secondary" onClick={() => addArrayItem('certifications', { name: '', issuer: '', issue_date: '', expiry_date: '', credential_id: '' })}>+ Add Certification</button>
            <div className="btn-group mt-2">
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>💾 Save Education & Certs</button>
            </div>
          </div>
        </div>
      )}

      {/* Links & Resume Tab */}
      {activeTab === 'links' && (
        <div className="dashboard-grid">
          <div className="glass-card">
            <h3>Professional Links</h3>
            <div className="form-group">
              <label className="form-label">LinkedIn URL</label>
              <input className="form-input" placeholder="https://linkedin.com/in/yourprofile" value={userData?.linkedin_url || ""} onChange={(e) => updateField('linkedin_url', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">GitHub URL</label>
              <input className="form-input" placeholder="https://github.com/yourusername" value={userData?.github_url || ""} onChange={(e) => updateField('github_url', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Portfolio URL</label>
              <input className="form-input" placeholder="https://yourportfolio.com" value={userData?.portfolio_url || ""} onChange={(e) => updateField('portfolio_url', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Personal Website</label>
              <input className="form-input" placeholder="https://yourwebsite.com" value={userData?.website_url || ""} onChange={(e) => updateField('website_url', e.target.value)} />
            </div>

            <h4>Additional Links</h4>
            {(userData?.urls || []).map((u, i) => (
              <div key={i} className="form-row mb-1">
                <input className="form-input" placeholder="Type (e.g., Twitter, Dribbble)" value={u.type || ""} onChange={(e) => updateArrayItem('urls', i, 'type', e.target.value)} />
                <input className="form-input" placeholder="URL" value={u.url || ""} onChange={(e) => updateArrayItem('urls', i, 'url', e.target.value)} />
                <button className="btn btn-ghost" onClick={() => removeArrayItem('urls', i)}>✕</button>
              </div>
            ))}
            <button className="btn btn-secondary mt-1" onClick={() => addArrayItem('urls', { type: '', url: '' })}>+ Add Link</button>
          </div>

          <div className="glass-card">
            <h3>Resume</h3>
            <div className="form-group">
              <label className="form-label">Upload Resume (PDF)</label>
              <input className="form-input" type="file" accept=".pdf,.doc,.docx" onChange={(e) => updateField('resume', e.target.files?.[0])} />
            </div>
            <div className="btn-group mb-2">
              <button className="btn btn-ghost" onClick={downloadResume}>📄 Download Current Resume</button>
            </div>

            <div className="ai-panel">
              <h4>🤖 AI Profile Extraction</h4>
              <p className="text-muted mb-2">Automatically extract work experience, education, and skills from your uploaded resume.</p>
              <button className="btn btn-ai" onClick={handleExtractProfile} disabled={extracting}>
                {extracting ? "✨ Extracting..." : "✨ Extract from Resume"}
              </button>
              
              {extractedPreview && (
                <div className="extracted-preview mt-2">
                  <div className="grid-4 mb-2">
                    <div className="stat-card">
                      <div className="stat-number">{(extractedPreview.work_experience || []).length}</div>
                      <div className="stat-label">Jobs</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-number">{(extractedPreview.education || []).length}</div>
                      <div className="stat-label">Education</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-number">{(extractedPreview.skills || []).length}</div>
                      <div className="stat-label">Skills</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-number">{(extractedPreview.certifications || []).length}</div>
                      <div className="stat-label">Certs</div>
                    </div>
                  </div>
                  <div className="btn-group">
                    <button className="btn btn-primary" onClick={() => handleApplyExtracted(true)}>✅ Merge</button>
                    <button className="btn btn-secondary" onClick={() => handleApplyExtracted(false)}>🔄 Replace</button>
                    <button className="btn btn-ghost" onClick={() => setExtractedPreview(null)}>✕ Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <div className="btn-group mt-2">
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>💾 Save Links & Resume</button>
            </div>
          </div>
        </div>
      )}

      {/* Screening Questions Tab */}
      {activeTab === 'screening' && (
        <div className="dashboard-grid">
          <div className="glass-card">
            <h3>Pre-Screening Answers</h3>
            <p className="text-muted mb-2">These are common questions asked during job applications. Fill them out once and autofill will use them.</p>
            
            <div className="form-group">
              <label className="form-label">How did you hear about us?</label>
              <select className="form-select" value={userData?.hear_about_us || ""} onChange={(e) => updateField('hear_about_us', e.target.value)}>
                <option value="">Select...</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Indeed">Indeed</option>
                <option value="Glassdoor">Glassdoor</option>
                <option value="Company Website">Company Website</option>
                <option value="Referral">Employee Referral</option>
                <option value="Job Fair">Job Fair</option>
                <option value="University/College">University/College</option>
                <option value="Social Media">Social Media</option>
                <option value="Recruiter">Recruiter</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Have you applied here before?</label>
                <select className="form-select" value={userData?.applied_before || ""} onChange={(e) => updateField('applied_before', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Have you worked here before?</label>
                <select className="form-select" value={userData?.worked_here_before || ""} onChange={(e) => updateField('worked_here_before', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Do you have relatives employed at the company?</label>
              <select className="form-select" value={userData?.has_relatives_here || ""} onChange={(e) => updateField('has_relatives_here', e.target.value)}>
                <option value="">Select...</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
          </div>

          <div className="glass-card">
            <h3>Additional Background</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Has Driver's License?</label>
                <select className="form-select" value={userData?.has_drivers_license || ""} onChange={(e) => updateField('has_drivers_license', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Has Personal Vehicle?</label>
                <select className="form-select" value={userData?.has_vehicle || ""} onChange={(e) => updateField('has_vehicle', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Security Clearance</label>
              <select className="form-select" value={userData?.security_clearance || ""} onChange={(e) => updateField('security_clearance', e.target.value)}>
                <option value="">None / Not Applicable</option>
                <option value="Confidential">Confidential</option>
                <option value="Secret">Secret</option>
                <option value="Top Secret">Top Secret</option>
                <option value="Top Secret/SCI">Top Secret/SCI</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <h4>EEO Information (Optional)</h4>
            <p className="text-muted mb-2">This information is voluntary and used for diversity tracking. It won't affect your application.</p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Disability Status</label>
                <select className="form-select" value={userData?.disability_status || ""} onChange={(e) => updateField('disability_status', e.target.value)}>
                  <option value="">Prefer not to answer</option>
                  <option value="No">No, I don't have a disability</option>
                  <option value="Yes">Yes, I have a disability</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Veteran Status</label>
                <select className="form-select" value={userData?.veteran_status || ""} onChange={(e) => updateField('veteran_status', e.target.value)}>
                  <option value="">Prefer not to answer</option>
                  <option value="Not a Veteran">Not a Veteran</option>
                  <option value="Protected Veteran">Protected Veteran</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="btn-group mt-2">
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>💾 Save Screening Info</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Tools Tab */}
      {activeTab === 'tools' && (
        <div className="dashboard-grid">
          <div className="glass-card">
            <h3>Job Description Match</h3>
            <div className="form-group">
              <label className="form-label">Paste Job Description</label>
              <textarea className="form-textarea" rows={8} placeholder="Paste the full job description here to analyze match and generate documents..." value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
            </div>
            <div className="btn-group">
              <button className="btn btn-primary" onClick={handleMatch}>🎯 Compute Match</button>
              <button className="btn btn-secondary" onClick={handleTailored}>📝 Tailored CV</button>
              <button className="btn btn-secondary" onClick={handleGenerateCoverLetter}>✉️ Cover Letter</button>
            </div>

            {matchResult && (
              <div className="match-result mt-2">
                <div className="match-score">
                  <div className="score-circle">
                    <span className="score-value">{matchResult.percent}%</span>
                    <span className="score-label">Match</span>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Matching Keywords</label>
                  <div className="chip-group">
                    {(matchResult.matchingWords || []).map((w, i) => <span key={i} className="chip">{w}</span>)}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Missing Keywords</label>
                  <div className="chip-group">
                    {(matchResult.missingWords || []).map((w, i) => <span key={i} className="chip chip-warning">{w}</span>)}
                  </div>
                </div>
              </div>
            )}

            {tailored && (
              <div className="tailored-preview mt-2">
                <h4>Tailored Resume Preview</h4>
                <pre className="preview-text">{tailored}</pre>
                <button className="btn btn-primary mt-1" onClick={downloadTailored}>📥 Download PDF</button>
              </div>
            )}
          </div>

          <div className="glass-card">
            <h3>AI Answer Generator</h3>
            <p className="text-muted mb-2">Generate answers for application questions using AI. Make sure to paste a job description first for context.</p>
            <div className="form-group">
              <label className="form-label">Application Question</label>
              <textarea className="form-textarea" rows={4} placeholder="e.g., Why are you interested in this position? Describe a challenging project you worked on..." value={appQuestion} onChange={(e) => setAppQuestion(e.target.value)} />
            </div>
            <button className="btn btn-ai" onClick={handleCustomAnswer}>✨ Generate Answer</button>
            
            {answer && (
              <div className="answer-preview mt-2">
                <label className="form-label">Generated Answer</label>
                <div className="preview-box">{answer}</div>
                <button className="btn btn-ghost mt-1" onClick={() => navigator.clipboard.writeText(answer)}>📋 Copy to Clipboard</button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Dashboard;

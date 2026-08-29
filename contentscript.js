
console.log("ApplyEase: Content script loading...");

const API_BASE = "http://127.0.0.1:8000";

// ------- Helpers -------
const getToken = () =>
  new Promise((resolve) =>
    chrome.storage.local.get("token", (d) => resolve(d?.token || null))
  );

// Mark that content script is loaded (for debugging)
window.__APPLYEASE_LOADED__ = true;
console.log("ApplyEase: Content script initialized on", window.location.href);

const fetchUserDetails = async (token) => {
  const headers = { Authorization: `Bearer ${token}` };
  const resUser = await fetch(`${API_BASE}/user`, { headers });
  if (!resUser.ok) throw new Error("Unauthorized or failed user fetch");
  const data = await resUser.json();
  const user = (data && data.user) ? data.user : data;
  // Prefer stored file; fallback to generated PDF; then raw text
  const resFile = await fetch(`${API_BASE}/resume_file`, { headers });
  if (resFile.ok) {
    const blob = await resFile.blob();
    const type = resFile.headers.get("Content-Type") || blob.type || "application/pdf";
    const disp = resFile.headers.get("Content-Disposition") || "";
    const fnameMatch = /filename=([^;]+)/i.exec(disp || "");
    const fname = fnameMatch ? fnameMatch[1].replace(/"/g, "").trim() : "resume.pdf";
    const file = new File([blob], fname, { type });
    return { ...user, resume: file };
  }
  const resPdf = await fetch(`${API_BASE}/resume_pdf`, { headers });
  let file = null;
  if (resPdf.ok) {
    const blob = await resPdf.blob();
    file = new File([blob], "resume.pdf", { type: "application/pdf" });
  } else {
    // Fallback: fetch raw text and upload as .txt (many ATS accept txt)
    const resText = await fetch(`${API_BASE}/resume`, { headers });
    if (resText.ok) {
      const json = await resText.json();
      const text = (json && (json.resume_text || json.resume || "")) || "";
      if (text) file = new File([text], "resume.txt", { type: "text/plain" });
    }
  }
  return { ...user, resume: file };
};

const uploadFile = (input, file) => {
  if (!file || !input) return false;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files; // may throw in some sites/browsers
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setTimeout(() => input.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    return true;
  } catch (e) {
    return false;
  }
};

const setValue = (el, val) => {
  if (!el) return;
  console.log("ApplyEase: setValue called for", el.outerHTML?.substring(0, 100), "with value:", val);
  
  // Focus the element
  el.focus();
  
  // Get the native value setter for React compatibility
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  
  // Use native setter if available (bypasses React's synthetic event system)
  if (el.tagName === 'INPUT' && nativeInputValueSetter) {
    nativeInputValueSetter.call(el, val);
  } else if (el.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
    nativeTextAreaValueSetter.call(el, val);
  } else {
    el.value = val;
  }
  
  // Dispatch multiple events to trigger various frameworks (React, Angular, Vue, etc.)
  const inputEvent = new Event('input', { bubbles: true, cancelable: true });
  el.dispatchEvent(inputEvent);
  
  // React 16+ uses this
  const nativeInputEvent = new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: val });
  el.dispatchEvent(nativeInputEvent);
  
  // Some frameworks listen to change
  const changeEvent = new Event('change', { bubbles: true, cancelable: true });
  el.dispatchEvent(changeEvent);
  
  // Keyboard events for frameworks that track them
  const keydownEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a' });
  const keyupEvent = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'a' });
  el.dispatchEvent(keydownEvent);
  el.dispatchEvent(keyupEvent);
  
  // Blur to trigger validation
  el.blur();
  const blurEvent = new FocusEvent('blur', { bubbles: true, cancelable: true });
  el.dispatchEvent(blurEvent);
  
  console.log("ApplyEase: setValue completed, current value:", el.value);
};

const closestLabelText = (input) => {
  try {
    const id = input.id ? `label[for='${input.id}']` : null;
    const forLabel = id ? document.querySelector(id) : null;
    const label = forLabel || input.closest("label") || input.parentElement?.querySelector("label");
    return (label?.textContent || "").toLowerCase();
  } catch {
    return "";
  }
};

// ------- JD Extraction -------
const JD_SELECTORS = [
  "[data-qa='job-description']", // Indeed
  "div.jobs-description__container, div.jobs-unified-top-card__content--two-pane", // LinkedIn
  "div.jobs-box__html-content", // LinkedIn alt
  "div[data-automation-id='jobPostingDescription'], [data-automation-id='jobPostingHeader'] ~ div", // Workday
  "div.posting div.content, div.section div.content", // Lever
  "section#content .content, .opening .content, .job .content, .content", // Greenhouse
  "div[data-ui='job-description'], [data-ui='job-view'], [data-testid='job-description']", // Ashby/other
  ".job-sections, .job-description, .description__text, #jobDescriptionText", // SmartRecruiters/Indeed alt
  "article, main", // generic containers
];

const getJobDescription = () => {
  // First try DOM selectors
  for (const sel of JD_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.textContent?.trim();
      if (text && text.length > 120) return Promise.resolve(text);
    }
  }
  // Fallback to meta description
  const meta = document.querySelector("meta[name='description'], meta[property='og:description']");
  if (meta?.content) return Promise.resolve(meta.content);
  // Network fallback: fetch current URL and parse
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "getTabUrl" }, async (url) => {
      try {
        const html = await (await fetch(url, { credentials: "omit" })).text();
        const div = document.createElement("div");
        div.innerHTML = html;
        for (const sel of JD_SELECTORS) {
          const el = div.querySelector(sel);
          const text = el?.textContent?.trim();
          if (text && text.length > 120) return resolve(text);
        }
        const m = div.querySelector("meta[name='description'], meta[property='og:description']");
        resolve(m?.content || "");
      } catch (e) {
        reject(e);
      }
    });
  });
};

// ------- Job info guessers & tracking -------
const TITLE_SELECTORS = [
  "h1[data-automation-id='jobPostingHeader']",
  ".jobs-unified-top-card__job-title",
  "h1.job-title, h1.title, h1",
  "[data-testid='job-title'], [data-qa='job-title']",
];
const COMPANY_SELECTORS = [
  ".jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name",
  "a[data-tn-element='companyName'], .icl-u-lg-mr--sm",
  "[data-automation-id='companyName'], [data-company], [data-company-name]",
  ".company, .job-company, .posting-company, .topcard__org-name-link",
];
const LOCATION_SELECTORS = [
  "[data-automation-id='job-location'], [data-qa='location']",
  ".jobs-unified-top-card__bullet, .job-location, .location",
];

const textFrom = (selectors) => {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t) return t.replace(/\s+/g, " ");
  }
  return "";
};

const guessJobInfo = () => {
  let title = textFrom(TITLE_SELECTORS);
  let company = textFrom(COMPANY_SELECTORS);
  let location = textFrom(LOCATION_SELECTORS);
  // Fallbacks from title tag
  if (!title || !company) {
    try {
      const dt = (document.title || "").split("|")[0]; // e.g., "Senior Engineer - Acme | LinkedIn"
      const parts = dt.split(" - ").map((s) => s.trim());
      if (!title && parts[0]) title = parts[0];
      if (!company && parts[1]) company = parts[1];
    } catch {}
  }
  // Clean company/platform names
  if (company && /(linkedin|indeed|lever|greenhouse|workday)/i.test(company)) company = "";
  return { title, company, location };
};

const createJobIfPossible = async (status = "applied") => {
  try {
    const token = await getToken();
    if (!token) return;
    const info = guessJobInfo();
    if (!info.company || !info.title) return; // backend requires both for POST
    const jd = await getJobDescription();
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    await fetch(`${API_BASE}/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        company: info.company,
        title: info.title,
        location: info.location || "",
        source: location.host,
        url: location.href,
        status,
        notes: "Auto-tracked via ApplyEase",
        jd_text: jd || "",
      }),
    });
  } catch {}
};

const setupAutoTrack = () => {
  const key = `applyease_tracked_${location.href}`;
  if (sessionStorage.getItem(key)) return;
  let fired = false;
  const mark = () => { fired = true; sessionStorage.setItem(key, "1"); };
  const handler = async () => {
    if (fired) return; // de-dupe
    await createJobIfPossible("applied");
    mark();
  };
  // Listen to form submissions (capture for early phase)
  try { document.addEventListener("submit", () => setTimeout(handler, 300), { capture: true }); } catch {}
  // Listen to common apply/submit buttons
  const isApplyButton = (el) => {
    const txt = (el.textContent || el.value || "").toLowerCase();
    return /(apply|submit|send application|continue|next)/i.test(txt);
  };
  Array.from(document.querySelectorAll("button, input[type=submit], a, [role='button']")).forEach((el) => {
    if (isApplyButton(el)) {
      try { el.addEventListener("click", () => setTimeout(handler, 800), { once: true }); } catch {}
    }
  });
};

// ------- Backend calls -------
const getMatch = async (jd, token) => {
  const res = await fetch(`${API_BASE}/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jobDescription: jd }),
  });
  if (!res.ok) throw new Error("match failed");
  return await res.json();
};

const getCustomAnswer = async (jd, question, token) => {
  const res = await fetch(`${API_BASE}/custom-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jobDescription: jd, applicationQuestion: question }),
  });
  if (!res.ok) return "";
  return (await res.json())?.answer || "";
};

// ------- Autofill -------
const addFillButtonsForTextareas = () => {
  // Textareas: add Fill buttons using local LLM (idempotent)
  Array.from(document.querySelectorAll("textarea")).forEach((ta) => {
    if (ta.nextSibling && ta.nextSibling.className === "applyease-fill-btn") return;
    const btn = document.createElement("button");
    btn.innerHTML = "✨ AI Fill";
    btn.className = "applyease-fill-btn";
    btn.style.cssText = `
      margin: 8px 0;
      padding: 8px 14px;
      background: linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%);
      color: #0a0f1e;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
      box-shadow: 0 4px 12px rgba(45, 212, 191, 0.3);
      transition: all 0.2s ease;
    `;
    btn.onmouseenter = () => { btn.style.transform = "translateY(-1px)"; btn.style.boxShadow = "0 6px 16px rgba(45, 212, 191, 0.4)"; };
    btn.onmouseleave = () => { btn.style.transform = "translateY(0)"; btn.style.boxShadow = "0 4px 12px rgba(45, 212, 191, 0.3)"; };
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.innerHTML = "⏳ Generating...";
      btn.style.background = "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)";
      const token = await getToken();
      const jd = await getJobDescription();
      const labelText = closestLabelText(ta) || "";
      const answer = await getCustomAnswer(jd, labelText || "Application question", token);
      setValue(ta, answer);
      btn.innerHTML = "✓ Done!";
      btn.style.background = "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)";
      setTimeout(() => {
        btn.innerHTML = "✨ AI Fill";
        btn.style.background = "linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)";
        btn.disabled = false;
      }, 1500);
    });
    ta.parentElement?.insertBefore(btn, ta.nextSibling);
  });
};

const fillForm = async (values) => {
  console.log("ApplyEase: Scanning for form fields...");
  
  // Get all possible input types including those with unusual attributes
  const inputs = Array.from(
    document.querySelectorAll("input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],input[type=file],input[type=Text],input[type=Email],input:not([type])")
  );
  
  console.log("ApplyEase: Found", inputs.length, "input fields");

  // Helper to get all identifying text for an input
  const getFieldIdentifiers = (i) => {
    const parts = [
      i.name || "",
      i.id || "",
      i.placeholder || "",
      i.getAttribute("aria-label") || "",
      i.getAttribute("aria-labelledby") || "",  // This contains "actionItem.firstName.idTag-error" on Cornerstone
      i.getAttribute("data-automation-id") || "",
      i.className || "",
      closestLabelText(i)
    ];
    return parts.join(" ").toLowerCase();
  };

  // Fill name combinations
  const firstNameEls = inputs.filter((i) => {
    const text = getFieldIdentifiers(i);
    // Match patterns like "firstname", "first_name", "first-name", "first name", "actionItem.firstName"
    return /(first[ _.-]*name|firstname|\.firstname\.|given|forename)/i.test(text);
  });
  const lastNameEls = inputs.filter((i) => {
    const text = getFieldIdentifiers(i);
    // Match patterns like "lastname", "last_name", "last-name", "last name", "actionItem.lastName"
    return /(last[ _.-]*name|lastname|\.lastname\.|surname|family)/i.test(text);
  });
  
  console.log("ApplyEase: Found first name fields:", firstNameEls.length, "last name fields:", lastNameEls.length);
  
  if (firstNameEls.length && lastNameEls.length) {
    firstNameEls.forEach((el) => { console.log("ApplyEase: Filling first name:", el); setValue(el, values.first_name || ""); });
    lastNameEls.forEach((el) => { console.log("ApplyEase: Filling last name:", el); setValue(el, values.last_name || ""); });
  } else {
    // Only treat as full name if explicitly labeled as such and not first/last specific
    const isFullName = (i) => {
      const text = getFieldIdentifiers(i);
      if (/(first|last|given|family|surname)/i.test(text)) return false;
      return /(full[ _-]*name|^name$|\bname\b)/i.test(text);
    };
    const fullNameEl = inputs.find((i) => isFullName(i));
    if (fullNameEl) {
      console.log("ApplyEase: Filling full name:", fullNameEl);
      setValue(fullNameEl, `${values.first_name || ""} ${values.last_name || ""}`.trim());
    }
  }

  // Email, phone, location
  const map = [
    { key: "email", re: /email|e-mail|\.email\./i },
    { key: "phone", re: /phone|mobile|tel|\.phone\./i },
  ];
  for (const { key, re } of map) {
    const el = inputs.find((i) => re.test(getFieldIdentifiers(i)));
    if (el && values[key]) {
      console.log(`ApplyEase: Filling ${key}:`, el.outerHTML?.substring(0, 150));
      setValue(el, values[key]);
    } else if (!el) {
      console.log(`ApplyEase: No field found for ${key}`);
    }
  }

  // Extended fields - all profile fields
  const extendedFields = [
    // Address
    { key: "address_line1", re: /address[_\s-]*(line)?[_\s-]*1|street|address$/i },
    { key: "address_line2", re: /address[_\s-]*(line)?[_\s-]*2|apt|suite|unit/i },
    { key: "city", re: /\bcity\b/i },
    { key: "state", re: /\bstate\b|province/i },
    { key: "zip_code", re: /zip|postal|postcode/i },
    { key: "location", re: /location|current.*location/i },
    // Personal Details
    { key: "date_of_birth", re: /birth|dob|date.*birth/i },
    { key: "nationality", re: /nationality|citizenship/i },
    // Employment
    { key: "current_company", re: /current.*company|company.*name|employer/i },
    { key: "current_salary", re: /current.*salary|present.*salary/i },
    { key: "desired_salary", re: /desired.*salary|expected.*salary|salary.*expect/i },
    { key: "years_of_experience", re: /years.*experience|experience.*years|total.*experience/i },
    { key: "available_start_date", re: /start.*date|available.*date|availability|join.*date/i },
    // Links
    { key: "linkedin_url", re: /linkedin/i },
    { key: "github_url", re: /github/i },
    { key: "portfolio_url", re: /portfolio|website|personal.*site/i },
    { key: "website_url", re: /website|homepage|personal.*url/i },
    // Emergency Contact
    { key: "emergency_contact_name", re: /emergency.*name|contact.*name/i },
    { key: "emergency_contact_phone", re: /emergency.*phone|emergency.*tel/i },
    { key: "emergency_contact_relationship", re: /emergency.*relation|contact.*relation/i },
  ];
  for (const { key, re } of extendedFields) {
    const el = inputs.find((i) => re.test(getFieldIdentifiers(i)));
    if (el && values[key]) {
      console.log(`ApplyEase: Filling ${key}:`, el.outerHTML?.substring(0, 150));
      setValue(el, values[key]);
    }
  }

  // Handle select/dropdown fields
  const selects = Array.from(document.querySelectorAll("select"));
  console.log("ApplyEase: Found", selects.length, "select fields");
  
  // Helper to fill a dropdown
  const fillDropdown = (fieldName, value, patterns) => {
    if (!value) return;
    const sel = selects.find((s) => patterns.test(getFieldIdentifiers(s)));
    if (sel) {
      console.log(`ApplyEase: Filling ${fieldName} dropdown`);
      const options = Array.from(sel.options);
      // Try exact match first, then partial
      let match = options.find((o) => o.value.toLowerCase() === value.toLowerCase() || o.text.toLowerCase() === value.toLowerCase());
      if (!match) {
        match = options.find((o) => o.value.toLowerCase().includes(value.toLowerCase()) || o.text.toLowerCase().includes(value.toLowerCase()));
      }
      if (match) {
        sel.value = match.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  };

  // Personal Details dropdowns
  fillDropdown("gender", values.gender, /gender|sex/i);
  fillDropdown("pronouns", values.pronouns, /pronoun/i);
  
  // Work Authorization dropdowns
  fillDropdown("work_authorization", values.work_authorization, /work.*auth|authorization|eligibility|status/i);
  fillDropdown("visa_type", values.visa_type, /visa.*type|visa.*status/i);
  fillDropdown("requires_sponsorship", values.requires_sponsorship, /sponsorship|sponsor/i);
  fillDropdown("legally_authorized", values.legally_authorized, /legally.*auth|authorized.*work|legal.*work/i);
  
  // Employment dropdowns
  fillDropdown("years_of_experience", values.years_of_experience, /years.*experience|experience.*years/i);
  fillDropdown("notice_period", values.notice_period, /notice.*period/i);
  fillDropdown("employment_type", values.employment_type, /employment.*type|job.*type|work.*type/i);
  fillDropdown("remote_preference", values.remote_preference, /remote|work.*location|workplace/i);
  fillDropdown("relocation", values.relocation, /relocation|relocate|willing.*move/i);
  fillDropdown("willing_to_travel", values.willing_to_travel, /travel|traveling/i);
  fillDropdown("salary_currency", values.salary_currency, /currency/i);
  
  // Screening Questions dropdowns
  fillDropdown("hear_about_us", values.hear_about_us, /hear.*about|how.*find|source/i);
  fillDropdown("applied_before", values.applied_before, /applied.*before|previous.*appl/i);
  fillDropdown("worked_here_before", values.worked_here_before, /worked.*before|worked.*here|former.*employee/i);
  fillDropdown("has_relatives_here", values.has_relatives_here, /relative|family.*member|relation/i);
  
  // Background dropdowns
  fillDropdown("has_drivers_license", values.has_drivers_license, /driver.*license|driving.*license/i);
  fillDropdown("has_vehicle", values.has_vehicle, /vehicle|car|transport/i);
  fillDropdown("security_clearance", values.security_clearance, /security.*clearance|clearance/i);
  fillDropdown("disability_status", values.disability_status, /disability|disabled/i);
  fillDropdown("veteran_status", values.veteran_status, /veteran|military/i);
  
  // Country dropdown (special handling for variations)
  if (values.country) {
    const countrySelect = selects.find((s) => /country/i.test(getFieldIdentifiers(s)));
    if (countrySelect) {
      console.log("ApplyEase: Filling country dropdown");
      const options = Array.from(countrySelect.options);
      // Try common variations: India, IN, IND
      const variations = [values.country, values.country.substring(0, 2).toUpperCase(), values.country.substring(0, 3).toUpperCase()];
      let match = null;
      for (const v of variations) {
        match = options.find((o) => o.value.toLowerCase() === v.toLowerCase() || o.text.toLowerCase() === v.toLowerCase());
        if (match) break;
        match = options.find((o) => o.value.toLowerCase().includes(v.toLowerCase()) || o.text.toLowerCase().includes(v.toLowerCase()));
        if (match) break;
      }
      if (match) {
        countrySelect.value = match.value;
        countrySelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  // State/Province dropdown
  if (values.state) {
    const stateSelect = selects.find((s) => /state|province|region/i.test(getFieldIdentifiers(s)));
    if (stateSelect) {
      console.log("ApplyEase: Filling state dropdown");
      const options = Array.from(stateSelect.options);
      let match = options.find((o) => o.value.toLowerCase() === values.state.toLowerCase() || o.text.toLowerCase() === values.state.toLowerCase());
      if (!match) match = options.find((o) => o.value.toLowerCase().includes(values.state.toLowerCase()) || o.text.toLowerCase().includes(values.state.toLowerCase()));
      if (match) {
        stateSelect.value = match.value;
        stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  // URLs (e.g., LinkedIn, GitHub)
  (values.urls || []).forEach((u) => {
    const type = (u.type || "").toLowerCase();
    const url = u.url || "";
    const el = inputs.find((i) => getFieldIdentifiers(i).includes(type));
    if (el && url) {
      console.log(`ApplyEase: Filling URL ${type}:`, el);
      setValue(el, url);
    }
  });

  // Resume upload (robust): target inputs labeled resume/cv and reveal hidden inputs if necessary
  const findResumeInputs = () => {
    const byAttr = Array.from(document.querySelectorAll("input[type=file]"))
      .filter((i) => /resume|cv/i.test(i.name || i.id || ""));
    const labeled = Array.from(document.querySelectorAll("label"))
      .filter((l) => /resume|cv/i.test(l.textContent || ""))
      .map((l) => (l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector("input[type=file]")))
      .filter(Boolean);
    // Also find ANY file input if none specifically for resume
    const allFileInputs = Array.from(document.querySelectorAll("input[type=file]"));
    return Array.from(new Set([...byAttr, ...labeled, ...allFileInputs]));
  };

  const ensureVisible = (input) => {
    try { input.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
  };

  const tryDropFile = (file) => {
    const dzSelectors = [
      ".dropzone", "[data-testid*='drop']", "[data-qa*='drop']", "[data-automation-id*='drop']",
      ".upload-dropzone", ".file-dropzone", "[aria-label*='drop']"
    ];
    let dz = null;
    for (const sel of dzSelectors) { dz = document.querySelector(sel); if (dz) break; }
    if (!dz) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      const evOpts = { bubbles: true, cancelable: true, dataTransfer: dt };
      const events = ["dragenter", "dragover", "drop"];
      for (const type of events) {
        const ev = new DragEvent(type, evOpts);
        dz.dispatchEvent(ev);
      }
      return true;
    } catch {
      return false;
    }
  };

  const resumeInputs = findResumeInputs();
  console.log("ApplyEase: Found", resumeInputs.length, "file input(s)");
  
  if (resumeInputs.length) {
    let fileToUse = values.resume || null;
    try {
      const hostKey = `applyease_use_tailored_${location.host}`;
      const token = await getToken();
      const useTl = await new Promise((resolve) => chrome.storage.session.get(hostKey, (d) => resolve(!!d?.[hostKey])));
      if (useTl && token) {
        const jd = await getJobDescription();
        const r1 = await fetch(`${API_BASE}/tailored_resume`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ jobDescription: jd, save: false }) });
        if (r1.ok) {
          const j = await r1.json();
          const r2 = await fetch(`${API_BASE}/render_pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: j.resume_text, filename: 'tailored_resume.pdf' }) });
          if (r2.ok) {
            const blob = await r2.blob();
            fileToUse = new File([blob], 'tailored_resume.pdf', { type: 'application/pdf' });
          }
        }
      }
    } catch (e) {}
    if (fileToUse) {
      console.log("ApplyEase: Attempting to upload resume:", fileToUse.name);
      let uploaded = false;
      resumeInputs.forEach((fi) => {
        ensureVisible(fi);
        const ok = uploadFile(fi, fileToUse);
        if (ok) {
          console.log("ApplyEase: Resume uploaded to:", fi);
          try { fi.dispatchEvent(new Event("blur", { bubbles: true })); } catch {}
          uploaded = true;
        }
      });
      if (!uploaded) {
        console.log("ApplyEase: Trying dropzone fallback");
        tryDropFile(fileToUse);
      }
    }
  }

  // Also ensure Fill buttons are present after autofill
  addFillButtonsForTextareas();
  console.log("ApplyEase: Autofill process finished");
};

// ------- Widget -------
const renderMatchWidget = (percent, onClick) => {
  let w = document.getElementById("applyease-match-widget");
  if (!w) {
    w = document.createElement("div");
    w.id = "applyease-match-widget";
    document.body.appendChild(w);
  }
  
  // Determine color based on match percentage
  const getMatchColor = (pct) => {
    if (pct >= 70) return { gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', glow: 'rgba(34, 197, 94, 0.4)' };
    if (pct >= 50) return { gradient: 'linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)', glow: 'rgba(45, 212, 191, 0.4)' };
    if (pct >= 30) return { gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', glow: 'rgba(251, 191, 36, 0.4)' };
    return { gradient: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)', glow: 'rgba(251, 146, 60, 0.4)' };
  };
  
  const colors = getMatchColor(percent);
  
  w.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 14px;
    width: 280px;
    background: linear-gradient(135deg, rgba(10, 15, 30, 0.92) 0%, rgba(26, 31, 62, 0.92) 100%);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: none;
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    color: #e5e7eb;
  `;
  
  w.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="
          width: 36px;
          height: 36px;
          background: ${colors.gradient};
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 4px 12px ${colors.glow};
        ">✨</div>
        <div>
          <div style="font-weight: 700; font-size: 13px; background: linear-gradient(135deg, #2dd4bf 0%, #3b82f6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">ApplyEase</div>
          <div style="font-size: 10px; color: rgba(255,255,255,0.5);">Resume Match</div>
        </div>
      </div>
      <button id="ae-close-widget" style="
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.4);
        cursor: pointer;
        font-size: 18px;
        padding: 4px;
        line-height: 1;
      ">×</button>
    </div>
    
    <div style="
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: rgba(255,255,255,0.03);
      border-radius: 12px;
      margin-bottom: 12px;
    ">
      <div style="
        font-size: 32px;
        font-weight: 700;
        background: ${colors.gradient};
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      ">${percent}%</div>
      <div style="flex: 1;">
        <div style="height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
          <div style="height: 100%; width: ${percent}%; background: ${colors.gradient}; border-radius: 4px; transition: width 0.5s ease;"></div>
        </div>
        <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 4px;">
          ${percent >= 70 ? 'Excellent match!' : percent >= 50 ? 'Good match' : percent >= 30 ? 'Moderate match' : 'Consider tailoring'}
        </div>
      </div>
    </div>
    
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
      <input type="checkbox" id="ae-use-tailored" style="
        width: 16px;
        height: 16px;
        accent-color: #2dd4bf;
        cursor: pointer;
      ">
      <label for="ae-use-tailored" style="font-size: 12px; color: rgba(255,255,255,0.7); cursor: pointer;">Use tailored CV for this application</label>
    </div>
    
    <div style="display: flex; gap: 8px;">
      <button id="ae-autofill-btn" style="
        flex: 1;
        padding: 10px 12px;
        background: linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%);
        color: #0a0f1e;
        border: none;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 4px 12px rgba(45, 212, 191, 0.3);
      ">✨ Auto Fill</button>
      <button id="ae-open-popup" style="
        padding: 10px 12px;
        background: rgba(255,255,255,0.05);
        color: #cbd5e1;
        border: none;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      ">📋</button>
    </div>
    
    <div style="display: flex; gap: 6px; margin-top: 10px;">
      <button id="ae-gen-cv" style="
        flex: 1;
        padding: 8px;
        background: rgba(99, 102, 241, 0.15);
        color: #a5b4fc;
        border: none;
        border-radius: 6px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s ease;
      ">📄 Custom CV</button>
      <button id="ae-tracker" style="
        flex: 1;
        padding: 8px;
        background: rgba(14, 165, 233, 0.15);
        color: #7dd3fc;
        border: none;
        border-radius: 6px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s ease;
      ">📋 Tracker</button>
    </div>
    
    <div style="text-align: center; margin-top: 10px; padding-top: 10px;">
      <span style="font-size: 9px; color: rgba(255,255,255,0.3);">Privacy-first • Local AI • No data shared</span>
    </div>
  `;
  
  // Event listeners
  const closeBtn = w.querySelector("#ae-close-widget");
  closeBtn.onclick = () => { w.style.display = "none"; };
  
  const openPopupBtn = w.querySelector("#ae-open-popup");
  openPopupBtn.onclick = onClick;
  
  const hostKey = `applyease_use_tailored_${location.host}`;
  const checkbox = w.querySelector("#ae-use-tailored");
  try { 
    chrome.storage.session.get(hostKey, (d) => { checkbox.checked = !!d?.[hostKey]; }); 
  } catch {}
  checkbox.addEventListener("change", () => { 
    try { 
      const v = {}; 
      v[hostKey] = checkbox.checked; 
      chrome.storage.session.set(v); 
    } catch {} 
  });
  
  const autofillBtn = w.querySelector("#ae-autofill-btn");
  autofillBtn.onclick = async () => {
    const originalText = autofillBtn.innerHTML;
    autofillBtn.innerHTML = "⏳ Filling...";
    autofillBtn.disabled = true;
    
    try {
      const token = await getToken();
      if (token) {
        const values = await fetchUserDetails(token);
        await fillForm(values);
        autofillBtn.innerHTML = "✓ Done!";
        autofillBtn.style.background = "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)";
        setTimeout(() => {
          autofillBtn.innerHTML = originalText;
          autofillBtn.style.background = "linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)";
          autofillBtn.disabled = false;
        }, 2000);
      } else {
        chrome.runtime.sendMessage({ action: "newTab", url: "http://localhost:3000/login" });
        autofillBtn.innerHTML = originalText;
        autofillBtn.disabled = false;
      }
    } catch (e) {
      console.error("ApplyEase: Autofill error", e);
      autofillBtn.innerHTML = "❌ Error";
      setTimeout(() => {
        autofillBtn.innerHTML = originalText;
        autofillBtn.disabled = false;
      }, 2000);
    }
  };
  
  const genCvBtn = w.querySelector("#ae-gen-cv");
  genCvBtn.onclick = async () => {
    const jd = await getJobDescription();
    chrome.runtime.sendMessage({ action: "newTab", url: `http://localhost:3000/dashboard?jd=${encodeURIComponent(jd)}` });
  };
  
  const trackerBtn = w.querySelector("#ae-tracker");
  trackerBtn.onclick = () => {
    chrome.runtime.sendMessage({ action: "newTab", url: "http://localhost:3000/job-tracker" });
  };
  
  // Add hover effects
  const addHoverEffect = (btn, hoverBg) => {
    btn.onmouseenter = () => { btn.style.transform = "translateY(-1px)"; };
    btn.onmouseleave = () => { btn.style.transform = "translateY(0)"; };
  };
  addHoverEffect(autofillBtn);
  addHoverEffect(openPopupBtn);
  addHoverEffect(genCvBtn);
  addHoverEffect(trackerBtn);
};

// ------- Messaging -------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ping") {
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === "fillInputFields") {
    const token = message.data;
    console.log("ApplyEase: Starting autofill...");
    fetchUserDetails(token)
      .then((values) => {
        console.log("ApplyEase: Got user details:", { 
          first_name: values.first_name, 
          last_name: values.last_name,
          email: values.email,
          hasResume: !!values.resume 
        });
        return fillForm(values);
      })
      .then(() => console.log("ApplyEase: Autofill completed"))
      .catch((e) => console.error("ApplyEase autofill error:", e))
      .finally(() => sendResponse({ ok: true }));
    return true; // async
  }
  if (message.action === "getOrSyncToken") {
    // Try chrome.storage first, then page localStorage, then persist
    try {
      chrome.storage.local.get("token", (d) => {
        let t = d?.token || null;
        if (t) return sendResponse({ token: t });
        try {
          const pageToken = window.localStorage?.getItem?.("token");
          if (pageToken) {
            chrome.storage.local.set({ token: pageToken }, () => sendResponse({ token: pageToken }));
          } else {
            sendResponse({ token: null });
          }
        } catch (e) {
          sendResponse({ token: null });
        }
      });
    } catch (e) {
      sendResponse({ token: null });
    }
    return true;
  }
  if (message.action === "getJobDescription") {
    getJobDescription().then((jd) => sendResponse({ jd })).catch(() => sendResponse({ jd: "" }));
    return true;
  }
  if (message.action === "computeMatch") {
    (async () => {
      try {
        const jd = await getJobDescription();
        if (!jd || jd.length < 20) return sendResponse({ ok: false, error: "no_jd" });
        const token = message.token || (await getToken());
        if (!token) return sendResponse({ ok: false, error: "no_token" });
        const match = await getMatch(jd, token);
        // refresh cache for popup reuse
        try { chrome.storage.session?.set?.({ applyease_last_match: match }); } catch {}
        return sendResponse({ ok: true, match });
      } catch (e) {
        return sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
  return false;
});

// Accept token via window message
window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data && data.source === "applyease" && data.action === "AddToken" && data.token) {
    chrome.storage.local.set({ token: data.token }, () => console.log("ApplyEase: token stored via window message"));
  }
});

// Auto-init: compute match on page load and show widget
(async () => {
  try {
    const token = await getToken();
    // Always inject Fill buttons for textareas; they work with or without token
    addFillButtonsForTextareas();

    // Observe DOM changes to add buttons for dynamically loaded textareas
    try {
      const mo = new MutationObserver(() => addFillButtonsForTextareas());
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } catch {}

    // Set up auto-tracking even if token fetch races; it checks token internally
    setupAutoTrack();
    if (!token) return;
    const jd = await getJobDescription();
    if (!jd || jd.length < 60) return;
    const match = await getMatch(jd, token);
    if (!match) return;
    // Cache for popup usage
    chrome.storage.session?.set?.({ applyease_last_match: match });
    renderMatchWidget(match.percent, () => {
      chrome.runtime.sendMessage({ action: "openPopup" });
    });
  } catch (e) {
    // ignore
  }
})();

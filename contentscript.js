
const API_BASE = "http://localhost:8000";

// ------- Helpers -------
const getToken = () =>
  new Promise((resolve) =>
    chrome.storage.local.get("token", (d) => resolve(d?.token || null))
  );

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
  el.focus();
  el.value = val;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.blur();
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
    btn.textContent = "Fill";
    btn.className = "applyease-fill-btn";
    btn.style.cssText = "margin: 8px 0; padding: 6px 10px; background:#2563eb;color:#fff;border:0;border-radius:4px;cursor:pointer;";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = "Filling...";
      const token = await getToken();
      const jd = await getJobDescription();
      const labelText = closestLabelText(ta) || "";
      const answer = await getCustomAnswer(jd, labelText || "Application question", token);
      setValue(ta, answer);
      btn.textContent = "Filled";
      setTimeout(() => (btn.textContent = "Fill", (btn.disabled = false)), 1200);
    });
    ta.parentElement?.insertBefore(btn, ta.nextSibling);
  });
};

const fillForm = async (values) => {
  const inputs = Array.from(
    document.querySelectorAll("input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],input[type=file],input:not([type])")
  );

  // Fill name combinations
  const firstNameEls = inputs.filter((i) =>
    /(first[ _-]*name|given|forename)/i.test(
      (i.name || "") + " " + (i.id || "") + " " + closestLabelText(i)
    )
  );
  const lastNameEls = inputs.filter((i) =>
    /(last[ _-]*name|surname|family)/i.test(
      (i.name || "") + " " + (i.id || "") + " " + closestLabelText(i)
    )
  );
  if (firstNameEls.length && lastNameEls.length) {
    firstNameEls.forEach((el) => setValue(el, values.first_name || ""));
    lastNameEls.forEach((el) => setValue(el, values.last_name || ""));
  } else {
    // Only treat as full name if explicitly labeled as such and not first/last specific
    const isFullName = (i) => {
      const text = ((i.name || "") + " " + (i.id || "") + " " + closestLabelText(i)).toLowerCase();
      if (/(first|last|given|family|surname)/i.test(text)) return false;
      return /(full[ _-]*name|^name$|\bname\b)/i.test(text);
    };
    const fullNameEl = inputs.find((i) => isFullName(i));
    if (fullNameEl) setValue(fullNameEl, `${values.first_name || ""} ${values.last_name || ""}`.trim());
  }

  // Email, phone, location
  const map = [
    { key: "email", re: /email|e-mail/i },
    { key: "phone", re: /phone|mobile|tel/i },
    { key: "location", re: /location|city|address/i },
  ];
  for (const { key, re } of map) {
    const el = inputs.find((i) => re.test(i.name || i.id || closestLabelText(i)));
    if (el && values[key]) setValue(el, values[key]);
  }

  // URLs (e.g., LinkedIn, GitHub)
  (values.urls || []).forEach((u) => {
    const type = (u.type || "").toLowerCase();
    const url = u.url || "";
    const el = inputs.find((i) => (i.name + " " + (i.id || "") + " " + closestLabelText(i)).toLowerCase().includes(type));
    if (el && url) setValue(el, url);
  });

  // Resume upload (robust): target inputs labeled resume/cv and reveal hidden inputs if necessary
  const findResumeInputs = () => {
    const byAttr = Array.from(document.querySelectorAll("input[type=file]"))
      .filter((i) => /resume|cv/i.test(i.name || i.id || ""));
    const labeled = Array.from(document.querySelectorAll("label"))
      .filter((l) => /resume|cv/i.test(l.textContent || ""))
      .map((l) => (l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector("input[type=file]")))
      .filter(Boolean);
    return Array.from(new Set([...byAttr, ...labeled]));
  };

  const ensureVisible = (input) => {
    // Do NOT programmatically click labels/buttons; that can open the file picker.
    // Just attempt to scroll into view; if hidden, we will try a drag&drop fallback.
    try { input.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
  };

  const tryDropFile = (file) => {
    // Attempt to dispatch a synthetic drop event on common dropzones
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
      let uploaded = false;
      resumeInputs.forEach((fi) => {
        ensureVisible(fi);
        const ok = uploadFile(fi, fileToUse);
        if (ok) {
          try { fi.dispatchEvent(new Event("blur", { bubbles: true })); } catch {}
          uploaded = true;
        }
      });
      if (!uploaded) {
        // Fallback to dropzone simulation if direct assignment blocked
        tryDropFile(fileToUse);
      }
    }
  }

  // Also ensure Fill buttons are present after autofill
  addFillButtonsForTextareas();
};

// ------- Widget -------
const renderMatchWidget = (percent, onClick) => {
  let w = document.getElementById("applyease-match-widget");
  if (!w) {
    w = document.createElement("div");
    w.id = "applyease-match-widget";
    w.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#0d9488;color:#fff;padding:10px 14px;border-radius:12px;font-family:sans-serif;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.15);min-width:240px;";
    document.body.appendChild(w);
  }
  w.innerHTML = "";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px";
  const label = document.createElement("div");
  label.textContent = `Resume Match: ${percent}%`;
  const openBtn = document.createElement("button");
  openBtn.textContent = "Open";
  openBtn.style.cssText = "background:rgba(255,255,255,.15);color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer";
  openBtn.onclick = onClick;
  row.appendChild(label); row.appendChild(openBtn);
  w.appendChild(row);

  const hostKey = `applyease_use_tailored_${location.host}`;
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:8px";
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "ae-use-tailored";
  const cbLabel = document.createElement("label"); cbLabel.htmlFor = "ae-use-tailored"; cbLabel.textContent = "Use tailored CV for this application";
  try { chrome.storage.session.get(hostKey, (d) => { cb.checked = !!d?.[hostKey]; }); } catch {}
  cb.addEventListener("change", () => { try { const v = {}; v[hostKey] = cb.checked; chrome.storage.session.set(v); } catch {} });
  wrap.appendChild(cb); wrap.appendChild(cbLabel); w.appendChild(wrap);

  const gen = document.createElement("button");
  gen.textContent = "Generate Custom CV";
  gen.style.cssText = "margin-top:6px;background:#2563eb;color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer;width:100%";
  gen.addEventListener("click", async () => {
    const jd = await getJobDescription();
    chrome.runtime.sendMessage({ action: "newTab", url: `http://localhost:3000/dashboard?jd=${encodeURIComponent(jd)}` });
  });
  w.appendChild(gen);

  const tracker = document.createElement("button");
  tracker.textContent = "Open Job Tracker";
  tracker.style.cssText = "margin-top:6px;background:#0ea5e9;color:#081018;border:0;padding:6px 10px;border-radius:8px;cursor:pointer;width:100%";
  tracker.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "newTab", url: `http://localhost:3000/job-tracker` });
  });
  w.appendChild(tracker);
};

// ------- Messaging -------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fillInputFields") {
    const token = message.data;
    fetchUserDetails(token)
      .then((values) => fillForm(values))
      .catch((e) => console.log("ApplyEase autofill error", e))
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

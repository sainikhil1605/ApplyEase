
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
  if (!file || !input) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  setTimeout(() => input.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
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
const fillForm = (values) => {
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
    try {
      // Click associated label/button to reveal hidden input
      if (getComputedStyle(input).display === "none" || input.className.includes("hidden") || input.offsetParent === null) {
        const label = document.querySelector(`label[for='${input.id}']`);
        label?.click?.();
        // Try nearby buttons inside the same upload group
        let group = input.closest(".file-upload, .upload, .file-upload__wrapper") || input.parentElement;
        const btn = group?.querySelector("button, .btn, [role='button']");
        btn?.click?.();
      }
    } catch {}
  };

  const resumeInputs = findResumeInputs();
  if (values.resume && resumeInputs.length) {
    resumeInputs.forEach((fi) => {
      ensureVisible(fi);
      uploadFile(fi, values.resume);
      // Fire extra events some sites listen for
      try { fi.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
      try { fi.dispatchEvent(new Event("change", { bubbles: true })); } catch {}
      try { fi.dispatchEvent(new Event("blur", { bubbles: true })); } catch {}
    });
  }

  // Textareas: add Fill buttons using local LLM
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

// ------- Widget -------
const renderMatchWidget = (percent, onClick) => {
  let w = document.getElementById("applyease-match-widget");
  if (!w) {
    w = document.createElement("div");
    w.id = "applyease-match-widget";
    w.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#0d9488;color:#fff;padding:10px 14px;border-radius:9999px;font-family:sans-serif;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.15);cursor:pointer";
    document.body.appendChild(w);
  }
  w.textContent = `Resume Match: ${percent}%`;
  w.onclick = onClick;
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
  if (message.action === "getJobDescription") {
    getJobDescription().then((jd) => sendResponse({ jd })).catch(() => sendResponse({ jd: "" }));
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

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM is loaded");

  const renderMatch = (token) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      const render = (match) => {
        const panel = document.getElementById("match-panel");
        const pct = document.getElementById("match-percent");
        const mat = document.getElementById("match-matching");
        const mis = document.getElementById("match-missing");
        panel.style.display = "block";
        pct.textContent = `${match.percent ?? 0}%`;
        mat.innerHTML = "";
        (match.matchingWords || []).slice(0, 50).forEach((w) => {
          const chip = document.createElement("span");
          chip.textContent = w;
          chip.style.cssText =
            "background:#f3f4f6;border:1px solid #e5e7eb;padding:4px 8px;border-radius:9999px;";
          mat.appendChild(chip);
        });
        mis.innerHTML = "";
        (match.missingWords || []).slice(0, 50).forEach((w) => {
          const chip = document.createElement("span");
          chip.textContent = w;
          chip.style.cssText =
            "background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;padding:4px 8px;border-radius:9999px;";
          mis.appendChild(chip);
        });
      };
      try {
        chrome.storage.session.get("applyease_last_match", (d) => {
          const cached = d?.applyease_last_match || null;
          if (cached) return render(cached);
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "computeMatch", token },
            (res) => { if (res && res.ok && res.match) render(res.match); }
          );
        });
      } catch (e) {}
    });
  };

  const initWithToken = (token) => {
    if (token) {
        document.getElementById("filling-text").style.display = "none";
        document.getElementById("loading").style.display = "none";
        const button = document.getElementById("auto-fill");
        button.addEventListener("click", () => {
          document.getElementById("loading").style.display = "flex";
          chrome.tabs.query(
            { active: true, currentWindow: true },
            async (tabs) => {
              chrome.tabs.sendMessage(
                tabs[0].id,
                {
                  action: "fillInputFields",
                  data: token,
                },
                (response) => {
                  console.log(response);
                  document.getElementById("loading").style.display = "none";
                }
              );
              // Also refresh match after autofill
              renderMatch(token);
            }
          );
        });
        const trackerBtn = document.getElementById("open-tracker");
        trackerBtn.addEventListener("click", () => {
          chrome.tabs.create({ url: "http://localhost:3000/job-tracker" });
        });
        // Render match immediately when popup opens
        renderMatch(token);
    } else {
      const loginBtn = document.getElementById("auto-fill");
      loginBtn.innerHTML = "Login to Auto Fill";
      loginBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: "http://localhost:3000/login" });
      });
      const trackerBtn = document.getElementById("open-tracker");
      trackerBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: "http://localhost:3000/job-tracker" });
      });
    }
  };

  // Primary: get token from extension storage via background
  chrome.runtime.sendMessage({ action: "fetchToken" }, (token) => {
    if (token) return initWithToken(token);
    // Fallback: ask content script to sync from page localStorage
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return initWithToken(null);
      chrome.tabs.sendMessage(tabs[0].id, { action: "getOrSyncToken" }, (resp) => {
        initWithToken(resp?.token || null);
      });
    });
  });
});

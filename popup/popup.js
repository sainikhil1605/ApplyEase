document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM is loaded");

  chrome.runtime.sendMessage(
    {
      action: "fetchToken",
    },
    (token) => {
      if (token) {
        document.getElementById("auto-fill").innerHTML = "Auto Fill";
        document.getElementById("filling-text").style.display = "none";
        document.getElementById("loading-gif").style.display = "none";
        const button = document.getElementById("auto-fill");
        document.addEventListener("click", () => {
          document.getElementById("filling-text").style.display = "block";
          document.getElementById("loading-gif").style.display = "block";
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
                  document.getElementById("filling-text").style.display =
                    "none";
                  document.getElementById("loading-gif").style.display = "none";
                }
              );
              // Also request JD and match to display in popup
              chrome.tabs.sendMessage(
                tabs[0].id,
                { action: "getJobDescription" },
                async (res) => {
                  try {
                    const jd = res?.jd || "";
                    if (!jd) return;
                    const matchResp = await fetch("http://localhost:8000/match", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ jobDescription: jd }),
                    });
                    if (!matchResp.ok) return;
                    const match = await matchResp.json();
                    const panel = document.getElementById("match-panel");
                    const pct = document.getElementById("match-percent");
                    const mat = document.getElementById("match-matching");
                    const mis = document.getElementById("match-missing");
                    panel.style.display = "block";
                    pct.textContent = `${match.percent}%`;
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
                  } catch (e) {
                    console.log(e);
                  }
                }
              );
            }
          );
        });
      } else {
        const loginBtn = document.getElementById("auto-fill");
        loginBtn.innerHTML = "Login to Auto Fill";
        loginBtn.addEventListener("click", () => {
          chrome.tabs.create({ url: "http://localhost:3000/login" });
        });
      }
    }
  );
});

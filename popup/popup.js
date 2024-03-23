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

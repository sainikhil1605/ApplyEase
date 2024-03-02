const fields = {
  name: "Nikhil",
  phone: "1234567890",
  email: "nikhil@gmail.com",
  location: "Overland Park,KS",
};
const eeoFields = {
  gender: "Male",
  race: "Asian (Not Hispanic or Latino)",
  veteran: "I am not a veteran",
};
const fetchUserDetails = async () => {
  const response = await fetch("http://localhost:3000/user");
  const data = await response.json();
  return data?.user;
};
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(message);
  if (message.token) {
    chrome.storage.local.set({ token: message.token }, () => {
      console.log("Token is set");
    });
  }
});
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get("token", (res) => {
    const token = res.token;
    console.log(token);
    if (token) {
      document.getElementById("auto-fill").innerHTML = "Auto Fill";

      const button = document.getElementById("auto-fill");
      document.addEventListener("click", () => {
        chrome.tabs.query(
          { active: true, currentWindow: true },
          async (tabs) => {
            const data = await fetchUserDetails();
            const urlsData = data?.urls;
            console.log(urlsData);
            chrome.tabs.sendMessage(
              tabs[0].id,
              {
                action: "fillInputFields",
                values: data,
                urlsData,
                eeoValues: eeoFields,
              },
              (response) => {
                console.log(response);
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
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: "login",
          },
          (response) => {
            console.log(response);
          }
        );
      });
    }
  });
});

onload = () => {};

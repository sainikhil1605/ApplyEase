const fields = {
  name: "Nikhil",
  phone: "1234567890",
  email: "nikhil@gmail.com",
  location: "Overland Park,KS",
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(message);
  if (message.action === "fetchToken") {
    chrome.storage.local.get("token", (data) => {
      const token = data.token;
      if (token) {
        sendResponse(token);
      } else {
        sendResponse(null);
      }
    });
  }
  if (message.action === "AddToken") {
    chrome.storage.local.set({ token: message.token }, () => {
      console.log("Token is set");
    });
  }

  if (message.action === "closeTab") {
    chrome.tabs.remove(sender.tab.id);
  }
  if (message.action === "newTab") {
    chrome.tabs.create({
      url: message.url,
      active: true,
    });
  }
  return true;
});

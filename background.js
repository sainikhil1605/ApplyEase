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
document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("auto-fill");
  document.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "fillInputFields", values: fields, eeoValues: eeoFields },
        (response) => {
          console.log(response);
        }
      );
    });
  });
});

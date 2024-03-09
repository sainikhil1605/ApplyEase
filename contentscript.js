const eeoFields = {
  gender: "Male",
  race: "Asian (Not Hispanic or Latino)",
  veteran: "I am not a veteran",
};

const fetchUserDetails = async (token) => {
  try {
    const response = await fetch("http://localhost:5000/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    return data?.user;
  } catch (err) {
    console.log(err);
  }
};

console.log("Content Script Running");
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(message);
  if (message.action === "fillInputFields") {
    console.log("Filling input fields");
    fetchUserDetails(message.data).then((data) => {
      const urlsData = data?.urls;
      const values = data;
      Object.keys(values)?.forEach((name) => {
        const field = document.querySelector(`input[name=${name}]`);
        if (field) {
          field.value = values[name];
        }
      });
      console.log(urlsData);
      urlsData?.forEach((url, index) => {
        const urlField = document.querySelector(
          `input[name='urls[${url.type}]']`
        );
        console.log(urlField);
        if (urlField) {
          urlField.value = url.url;
        }
      });
      Object.keys(eeoValues)?.forEach((name) => {
        const field = document.querySelector(`select[name='eeo[${name}]']`);
        if (field) {
          field.value = eeoValues[name];
        }
      });
    });
    return true;
  }
});

// document.addEventListener("DOMContentLoaded", function () {
//   const submitButton = document.getElementById("submitButton");
//   console.log(submitButton);

//   submitButton.addEventListener("click", function (event) {
//     event.preventDefault();
//     const email = document.querySelector("input[name=email").value;
//     const password = document.querySelector("input[name=password").value;
//     const loginUser = async () => {
//       const response = await fetch("http://localhost:3000/login", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({ email, password }),
//       });
//       const data = await response.json();
//       return data;
//     };
//     loginUser().then((data) => {
//       console.log(data);
//       chrome.runtime.sendMessage({ action: "AddToken", token: data.token });
//       chrome.runtime.sendMessage({
//         action: "newTab",
//         url: "http://localhost:3000/dashboard",
//         token: data.token,
//       });
//       chrome.runtime.sendMessage({ action: "closeTab" });
//     });
//   });
// });

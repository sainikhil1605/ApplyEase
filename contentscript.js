const eeoFields = {
  gender: "Male",
  race: "Asian (Not Hispanic or Latino)",
  veteran: "I am not a veteran",
};
function createRegexPattern(name) {
  // Escape special characters in the input string
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Create a regex pattern that matches variations of "first name" with optional characters before and after
  const pattern = new RegExp(`.*${escapedName.split("").join("[ _]*")}.*`, "i");
  // Also allow camelCase variations (e.g., firstName)
  const camelCasePattern = new RegExp(
    `.*${escapedName.split("").join("[ _]*|")}.*`,
    "i"
  );
  return new RegExp(`(${pattern.source})|(${camelCasePattern.source})`);
}

const fetchUserDetails = async (token) => {
  try {
    const response = await fetch("http://localhost:5000/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    const resume = await fetch("http://localhost:5000/resume", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const resumeData = await resume.blob();
    let metadata = {
      type: "application/pdf",
    };
    data.user.resume = new File([resumeData], "resume.pdf", metadata);
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
      const nameField = document.querySelector("input[name='name']");
      if (nameField) {
        nameField.value = `${values.first_name} ${values.last_name}`;
      }
      const inputFields = Array.from(
        document.querySelectorAll(
          "input[type=text], input[type=email], input[type=tel], input[type=number], input[type=date], input[type=file]"
        )
      );
      console.log(inputFields);
      inputFields?.forEach((field) => {
        if (field.name && values[field.name]) {
          if (name === "resume") {
            const dt = new DataTransfer();
            dt.items.add(values.resume);
            field.files = dt.files;
            const event = new Event("change", {
              bubbles: !0,
            });
            field.dispatchEvent(event);
          } else {
            field.value = values[field.name];
          }
        } else if (field.id) {
          try {
            const label = document.querySelector(
              `label[for=${field.id}]`
            )?.textContent;
            if (field.type === "file" && label.toLowerCase() === "resume") {
              const dt = new DataTransfer();
              dt.items.add(values.resume);
              field.files = dt.files;
              const event = new Event("change", {
                bubbles: !0,
              });
              field.dispatchEvent(event);
            } else if (label.toLowerCase() === "name") {
              field.value = `${values.first_name} ${values.last_name}`;
            } else {
              Object.keys(values)?.forEach((name) => {
                const filteredName = name.replace(/_/g, " ").toLowerCase();
                if (label.toLocaleLowerCase().includes(filteredName)) {
                  console.log(name);
                  console.log(field);
                  field.value = values[name];
                }
                setTimeout(() => {
                  // Scroll the field into view
                  field.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 1000);
              });
            }
          } catch (e) {
            console.log(e);
          }
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
  sendResponse({ message: "Received" });
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

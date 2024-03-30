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
const setField = (values, field, fieldKey) => {
  const isURL = fieldKey.toLowerCase().includes("url");
  if (isURL) {
    values?.urls?.forEach((url, index) => {
      const urlFieldType = fieldKey.toLowerCase();
      if (urlFieldType.includes(url?.type.toLowerCase())) {
        field.value = url.url;
        const event = new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          view: window,
        });
        field.dispatchEvent(event);
        field.blur();
        // Scroll the field into view
        setTimeout(() => {
          field.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 1000);
      }
    });
    return;
  }
  console.log(fieldKey);
  Object.keys(values)?.forEach((name) => {
    const filteredName = name.replace(/_/g, "").toLowerCase();
    if (fieldKey.replace(/\s/g, "").toLowerCase().includes(filteredName)) {
      field.value = values[name];
      const event = new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      field.dispatchEvent(event);
      field.blur();
      // Scroll the field into view
      setTimeout(() => {
        field.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 1000);
    }
  });
};
const uploadFile = (field, file) => {
  const dt = new DataTransfer();
  dt.items.add(file);
  field.files = dt.files;
  const event = new Event("change", {
    bubbles: !0,
  });
  field.dispatchEvent(event);
};
const getJobDescription = () => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "getTabUrl" }, async (response) => {
      try {
        const tabUrl = response;
        const urlStripped = tabUrl.split("/");
        urlStripped.pop();
        jobUrl = urlStripped.join("/");
        const res = await (await fetch(jobUrl)).text();
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = res;
        const jobDescription = tempDiv.querySelector(
          "[data-qa='job-description']"
        );
        resolve(jobDescription.textContent);
      } catch (e) {
        reject(e);
      }
    });
  });
};
const autoFillCustomAnswer = async (
  jobDescription,
  applicationQuestion,
  token
) => {
  const response = await fetch("http://localhost:5000/custom-answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jobDescription,
      applicationQuestion,
    }),
  });
  const data = await response.json();
  return data;
};
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fillInputFields") {
    const token = message.data;
    fetchUserDetails(message.data).then((data) => {
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

      inputFields?.forEach((field) => {
        // Find the field by name
        if (field.name) {
          try {
            if (field.type === "file") {
              uploadFile(field, values[field.name] || null);
            } else {
              setField(values, field, field.name);
            }
          } catch (e) {
            console.log(e);
          }
        }
        // Find the field by id
        else if (field.id) {
          try {
            const label = document.querySelector(
              `label[for=${field.id}]`
            )?.textContent;
            if (field.type === "file" && label.toLowerCase() === "resume") {
              uploadFile(field, values.resume || null);
            } else if (
              label.toLowerCase() === "name" ||
              label.toLowerCase() === "full name"
            ) {
              field.value = `${values.first_name} ${values.last_name}`;
            } else {
              setField(values, field, label);
            }
          } catch (e) {
            console.log(e);
          }
        }
      });
      const textAreas = Array.from(document.querySelectorAll("textarea"));
      textAreas?.forEach((field) => {
        try {
          const label = field.closest("label");
          const btn = document.createElement("button");
          btn.textContent = "Fill";
          btn.className = "textarea-fill-btn";
          btn.style.cssText =
            "background: #36789c; color: white; padding: 10px 24px; border: none; cursor: pointer; border-radius: 5px; margin: 10px 0;";

          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const label = field.closest("label");
            btn.textContent = "Filling...";
            const applicationQuestion = label.textContent;
            const jobDescription = await getJobDescription();
            console.log(jobDescription);
            const ans = await autoFillCustomAnswer(
              jobDescription,
              applicationQuestion,
              token
            );
            field.value = ans;
            btn.textContent = "Filled";
          });
          label.appendChild(btn);
          console.log(field.closest("label").textContent);
        } catch (e) {
          console.log(e);
        }
      });
    });
    return true;
  }
  sendResponse({ message: "Received" });
});

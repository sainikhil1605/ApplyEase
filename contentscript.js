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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fillInputFields") {
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
          if (field.type === "file") {
            // uploadFile(field, values[field.name] || null);
          } else {
            setField(values, field, field.name);
          }
        }
        // Find the field by id
        else if (field.id) {
          try {
            const label = document.querySelector(
              `label[for=${field.id}]`
            )?.textContent;
            if (field.type === "file" && label.toLowerCase() === "resume") {
              // uploadFile(field, values.resume || null);
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

      // Object.keys(eeoValues)?.forEach((name) => {
      //   const field = document.querySelector(`select[name='eeo[${name}]']`);
      //   if (field) {
      //     field.value = eeoValues[name];
      //   }
      // });
    });
    return true;
  }
  sendResponse({ message: "Received" });
});

console.log("content script loaded");
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(message);
  if (message.action === "fetchInputFields") {
    const inputFields = document.querySelectorAll("input");
    const inputValues = [];
    inputFields.forEach((field) => {
      inputValues.push(field.value);
    });
    console.log(inputValues);
    sendResponse(inputValues);
  }
  if (message.action === "fillInputFields") {
    const { values, eeoValues } = message;
    Object.keys(values)?.forEach((name) => {
      const field = document.querySelector(`input[name=${name}]`);
      if (field) {
        field.value = values[name];
      }
    });
    Object.keys(eeoValues)?.forEach((name) => {
      const field = document.querySelector(`select[name='eeo[${name}]']`);
      if (field) {
        field.value = eeoValues[name];
      }
    });
  }
});

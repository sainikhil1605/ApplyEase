/*global chrome*/
import logo from "./logo.svg";
import "./App.css";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import { useEffect } from "react";

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/dashboard", element: <Dashboard /> },
]);

function App() {
  useEffect(() => {
    const getToken = () => {
      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          "hdihofgbikbakkcghaaobjkcjphlmdfb",
          { action: "fetchToken" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Chrome runtime error:", chrome.runtime.lastError);
              return;
            }
            if (response) {
              console.log("Token fetched:", response);
              localStorage.setItem("token", response);
            } else {
              console.warn("No response received from extension.");
            }
          }
        );
      } else {
        console.error("Chrome API is not available.");
      }
    };

    getToken();
  }, []);

  return (
    <div className="App">
      <RouterProvider router={router} />
    </div>
  );
}

export default App;

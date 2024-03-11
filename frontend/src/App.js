/*global chrome*/
import logo from "./logo.svg";
import "./App.css";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import { useEffect } from "react";

function App() {
  const router = createBrowserRouter([
    {
      path: "/login",
      element: <Login />,
    },
    {
      path: "/dashboard",
      element: <Dashboard />,
    },
  ]);
  useEffect(() => {
    const getToken = async () => {
      chrome.runtime.sendMessage(
        "hdihofgbikbakkcghaaobjkcjphlmdfb",
        { action: "fetchToken" },
        (response) => {
          if (response) {
            console.log(response);
            localStorage.setItem("token", response);
          }
        }
      );
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

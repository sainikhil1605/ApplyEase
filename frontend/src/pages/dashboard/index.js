/* eslint-disable no-undef */
import { useEffect, useState } from "react";
import axios from "axios";
const Dashboard = () => {
  const [userData, setUserData] = useState(null);
  useEffect(() => {
    const getData = () => {
      chrome.runtime.sendMessage(
        "hdihofgbikbakkcghaaobjkcjphlmdfb",
        { action: "fetchToken" },
        (response) => {
          console.log(response);
          if (response) {
            const token = response;
            const data = axios
              .get("http://localhost:5000/user", {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              })
              .then((response) => {
                console.log(response.data.user);
                setUserData(response.data.user);
              })
              .catch((error) => {
                console.log(error);
              });
            console.log("Token is present");
          } else {
            console.log("Token is not present");
          }
        }
      );
    };
    getData();
  }, []);
  return (
    <div>
      <div>Dashboard</div>
      <div>
        <label>Resume</label>
        <input type="file" />
      </div>
      <div>
        <label>First Name</label>
        <input type="text" value={userData?.first_name} />
      </div>
      <div>
        <label>Last Name</label>
        <input type="text" value={userData?.last_name} />
      </div>
      <div>
        {userData?.urls?.map((url, index) => {
          return (
            <div key={index}>
              <label>{url.type}</label>
              <input type="text" value={url.url} />
            </div>
          );
        })}
      </div>
      <div>
        EEO fields
        <div>
          <label>Gender</label>
          <select>
            <options value="Male">Male</options>
            <options value="Female">Female</options>
            <option value="Decline to self-identify">
              Decline to self-indentify
            </option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

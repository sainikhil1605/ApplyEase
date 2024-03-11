/* eslint-disable no-undef */
import { useEffect, useState } from "react";
import axiosInstance from "../../utils/axiosInstance";
const Dashboard = () => {
  const [userData, setUserData] = useState(null);
  console.log(userData);
  useEffect(() => {
    const getData = () => {
      const data = axiosInstance
        .get("/user")
        .then((response) => {
          console.log(response.data.user);
          setUserData(response.data.user);
        })
        .catch((error) => {
          console.log(error);
        });
    };
    getData();
  }, []);
  const handleSubmit = async () => {
    console.log(userData);
    const formData = new FormData();
    formData.append("resume", userData.resume);
    formData.append("first_name", userData.first_name);
    formData.append("last_name", userData.last_name);
    userData.urls.forEach((url) => {
      formData.append("urls", JSON.stringify(url));
    });
    const response = await axiosInstance.patch("/user", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  };
  return (
    <div>
      <div>Dashboard</div>
      <div>
        <label>Resume</label>
        <input
          type="file"
          onChange={(e) =>
            setUserData({ ...userData, resume: e.target.files[0] })
          }
        />
      </div>
      <div>
        <label>First Name</label>
        <input
          type="text"
          value={userData?.first_name}
          onChange={(e) =>
            setUserData({ ...userData, first_name: e.target.value })
          }
        />
      </div>
      <div>
        <label>Last Name</label>
        <input
          type="text"
          value={userData?.last_name}
          onChange={(e) =>
            setUserData({ ...userData, last_name: e.target.value })
          }
        />
      </div>
      <div>
        {userData?.urls?.map((url, index) => {
          return (
            <div key={index}>
              <label>{url.type}</label>
              <input
                type="text"
                value={url.url}
                onChange={(e) => {
                  const newUrls = userData.urls;
                  newUrls[index].url = e.target.value;
                  setUserData({ ...userData, urls: [...newUrls] });
                }}
              />
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
      <div>
        <button onClick={() => handleSubmit()}>Submit</button>
      </div>
    </div>
  );
};

export default Dashboard;

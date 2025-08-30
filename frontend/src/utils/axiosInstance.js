/* eslint-disable no-undef */
import axios from "axios";

const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_BASE || "http://localhost:8000",
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (resp) => resp,
  (error) => {
    if (error?.response?.status === 401) {
      // Token invalid/expired; clear and redirect
      localStorage.removeItem("token");
      try {
        window.location.href = "/login";
      } catch {}
    }
    return Promise.reject(error);
  }
);
export default axiosInstance;

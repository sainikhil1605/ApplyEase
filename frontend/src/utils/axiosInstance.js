import axios from "axios";

const axiosInstance = axios.create({
  // Use 127.0.0.1 instead of localhost to avoid Windows IPv6 DNS resolution delays
  baseURL: process.env.REACT_APP_API_BASE || "http://127.0.0.1:8000",
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
      // Clear token – writing null triggers the storage event that
      // ProtectedRoute listens to, so it re-evaluates reactively
      // without a full page reload.
      localStorage.removeItem("token");
      // Dispatch a storage event manually for same-tab listeners
      // (the native storage event only fires in OTHER tabs)
      window.dispatchEvent(new StorageEvent("storage", { key: "token", newValue: null }));
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;

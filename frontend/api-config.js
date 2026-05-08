(function () {
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const API_BASE =
    localStorage.getItem("tiny.storyApiBase") ||
    (isLocalHost ? "http://localhost:8000" : "") ||
    "https://tinytales-2f38.onrender.com";

  window.API_BASE = String(API_BASE).replace(/\/+$/, "");
})();

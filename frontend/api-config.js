(function () {
  const API_BASE =
    localStorage.getItem("tiny.storyApiBase") ||
    "https://tinytales-2f38.onrender.com";

  window.API_BASE = String(API_BASE).replace(/\/+$/, "");
})();

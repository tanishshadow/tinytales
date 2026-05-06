(function () {
  const apiBase = window.API_BASE || "";
  const status = document.getElementById("auth-status");
  const sessionTitle = document.getElementById("auth-session-title");
  const sessionCopy = document.getElementById("auth-session-copy");
  const userCard = document.getElementById("auth-user-card");
  const userPicture = document.getElementById("auth-user-picture");
  const userName = document.getElementById("auth-user-name");
  const userEmail = document.getElementById("auth-user-email");
  const logoutButton = document.getElementById("auth-logout");

  function setStatus(message, tone) {
    if (!status) {
      return;
    }
    status.textContent = message;
    status.dataset.tone = tone || "idle";
  }

  function setSignedOut() {
    if (sessionTitle) {
      sessionTitle.textContent = "Not signed in yet";
    }
    if (sessionCopy) {
      sessionCopy.textContent = "Use Google to connect the parent account for this browser.";
    }
    if (userCard) {
      userCard.hidden = true;
    }
    if (logoutButton) {
      logoutButton.hidden = true;
    }
  }

  function setSignedIn(user) {
    if (sessionTitle) {
      sessionTitle.textContent = "Signed in";
    }
    if (sessionCopy) {
      sessionCopy.textContent = "This parent account is ready for saved stories and family controls.";
    }
    if (userName) {
      userName.textContent = user.name || "TinyTales parent";
    }
    if (userEmail) {
      userEmail.textContent = user.email || "";
    }
    if (userPicture) {
      userPicture.src = user.picture || "";
      userPicture.alt = user.name ? `${user.name} profile photo` : "Parent profile photo";
      userPicture.hidden = !user.picture;
    }
    if (userCard) {
      userCard.hidden = false;
    }
    if (logoutButton) {
      logoutButton.hidden = false;
    }
  }

  async function refreshSession() {
    try {
      const response = await fetch(`${apiBase}/api/auth/session`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Session check failed");
      }
      const session = await response.json();
      if (session.authenticated && session.user) {
        setSignedIn(session.user);
        setStatus("Google account connected.", "success");
      } else {
        setSignedOut();
        setStatus("Choose sign up or login to continue with Google.", "idle");
      }
    } catch (error) {
      setSignedOut();
      setStatus("Could not reach the auth endpoint. Check API_BASE and backend config.", "error");
    }
  }

  document.querySelectorAll("[data-auth-mode]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const mode = link.getAttribute("data-auth-mode") === "signup" ? "signup" : "login";
      window.location.href = `${apiBase}/api/auth/google?mode=${mode}`;
    });
  });

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      logoutButton.disabled = true;
      setStatus("Logging out.", "idle");
      try {
        await fetch(`${apiBase}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
        setSignedOut();
        setStatus("Logged out.", "success");
      } catch (error) {
        setStatus("Logout failed. Try again in a moment.", "error");
      } finally {
        logoutButton.disabled = false;
      }
    });
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("auth") === "success") {
    setStatus("Google connected. Loading your session.", "success");
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get("auth") === "error") {
    setStatus("Google sign-in was cancelled or could not finish.", "error");
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  refreshSession();
})();

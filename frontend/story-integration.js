(function () {
  const STORAGE_KEY = "tiny.latestStorybook";
  const EMPTY_VALUE = "Not set";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getStorybookUrl(storybookId) {
    return storybookId
      ? "storybook.html?storybookId=" + encodeURIComponent(storybookId)
      : "storybook.html";
  }

  function formatDate(value) {
    if (!value) {
      return EMPTY_VALUE;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return EMPTY_VALUE;
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function saveStorybook(storybook) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storybook));
  }

  function loadStorybook() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function setStatus(element, message, tone) {
    if (!element) {
      return;
    }
    element.textContent = message;
    element.dataset.state = tone || "idle";
  }

  function getApiBase() {
    return String(window.API_BASE || "");
  }

  async function generateStorybook(form) {
    const status = document.getElementById("story-generator-status");
    const submitButton = document.getElementById("story-submit-button");
    const formData = new FormData(form);
    const prompt = String(formData.get("prompt") || "").trim();

    if (!prompt) {
      setStatus(status, "Please share the feeling or bedtime worry first.", "error");
      return;
    }

    formData.set("prompt", prompt);
    if (!String(formData.get("child_name") || "").trim()) {
      formData.set("child_name", "the little one");
    }

    const apiBase = getApiBase();
    submitButton.disabled = true;
    form.dataset.busy = "true";
    setStatus(status, "Generating storybook from the backend...", "loading");

    try {
      const response = await fetch(`${apiBase}/api/generate`, {
        method: "POST",
        body: formData,
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (!response.ok) {
        const detail =
          payload && typeof payload.detail === "string"
            ? payload.detail
            : "The backend could not create a storybook.";
        throw new Error(detail);
      }

      saveStorybook(payload);
      setStatus(status, "Storybook ready. Opening the reading view...", "success");
      window.setTimeout(function () {
        const destination = payload && payload.id
          ? "storybook.html?storybookId=" + encodeURIComponent(payload.id)
          : "storybook.html";
        window.location.href = destination;
      }, 350);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to reach the backend right now.";
      setStatus(status, message, "error");
    } finally {
      submitButton.disabled = false;
      form.dataset.busy = "false";
    }
  }

  async function fetchStorybookById(storybookId) {
    if (!storybookId) {
      return null;
    }

    const apiBase = getApiBase();
    const response = await fetch(
      `${apiBase}/api/storybook/${encodeURIComponent(storybookId)}`
    );

    if (!response.ok) {
      throw new Error("Unable to load the requested storybook.");
    }

    const payload = await response.json();
    saveStorybook(payload);
    return payload;
  }

  async function fetchStorybooks() {
    const apiBase = getApiBase();
    const response = await fetch(`${apiBase}/api/storybooks`);

    if (!response.ok) {
      throw new Error("Unable to load the saved story library.");
    }

    return response.json();
  }

  async function fetchHealth() {
    const apiBase = getApiBase();
    const response = await fetch(`${apiBase}/api/health`);

    if (!response.ok) {
      throw new Error("Unable to reach the backend health endpoint.");
    }

    return response.json();
  }

  function applyStorybookSummary(storybook, hasLiveStory) {
    const titleElement = document.getElementById("storybook-title");
    const copyElement = document.getElementById("storybook-summary-copy");
    const childElement = document.getElementById("storybook-child");
    const toneElement = document.getElementById("storybook-tone");
    const pagesElement = document.getElementById("storybook-pages");

    if (!titleElement || !copyElement || !childElement || !toneElement || !pagesElement) {
      return;
    }

    if (!storybook) {
      titleElement.textContent = "Demo storybook";
      copyElement.textContent =
        "Open a generated story from the previous page to replace the demo content with live backend output.";
      childElement.textContent = "Not set";
      toneElement.textContent = "Gentle";
      pagesElement.textContent = "6";
      return;
    }

    titleElement.textContent = storybook.title || "A Brave Little Story";
    copyElement.textContent = hasLiveStory
      ? (storybook.original_prompt || "A personalized story generated by the backend.")
      : "Showing the most recently saved story available in this browser.";
    childElement.textContent = storybook.child_name || "the little one";
    toneElement.textContent = storybook.tone || "gentle";
    pagesElement.textContent = String(
      Array.isArray(storybook.pages) ? storybook.pages.length : 0
    );
  }

  function applyStorybookPages(storybook) {
    if (!storybook || !Array.isArray(storybook.pages) || !storybook.pages.length) {
      return;
    }

    window.storyPages = storybook.pages;

    const root = document.getElementById("storybook-root");
    if (
      root &&
      typeof window.renderStorybook === "function"
    ) {
      if (
        window.storybookComponent &&
        typeof window.storybookComponent.destroy === "function"
      ) {
        window.storybookComponent.destroy();
      }

      window.storybookComponent = window.renderStorybook(root, {
        storyPages: storybook.pages,
        onFlipComplete:
          typeof window.onStoryFlipComplete === "function"
            ? window.onStoryFlipComplete
            : null,
      });
    }
  }

  function applyPageStoryContext(storybook, health) {
    const titleElement = document.getElementById("page-current-title");
    const copyElement = document.getElementById("page-current-copy");
    const childElement = document.getElementById("page-current-child");
    const toneElement = document.getElementById("page-current-tone");
    const pagesElement = document.getElementById("page-current-pages");
    const backendElement = document.getElementById("page-backend-status");

    if (!titleElement || !copyElement || !childElement || !toneElement || !pagesElement || !backendElement) {
      return;
    }

    backendElement.textContent = health
      ? health.gemini_configured
        ? "Online"
        : "API online, Gemini missing"
      : "Unavailable";

    if (!storybook) {
      titleElement.textContent = "No story generated yet";
      copyElement.textContent =
        "Create a story once and this page will automatically reflect the latest child, tone, and page count from the backend flow.";
      childElement.textContent = EMPTY_VALUE;
      toneElement.textContent = "Gentle";
      pagesElement.textContent = "0";
      return;
    }

    titleElement.textContent = storybook.title || "A Brave Little Story";
    copyElement.textContent = storybook.original_prompt
      ? storybook.original_prompt
      : "This page is using the latest available storybook data.";
    childElement.textContent = storybook.child_name || "the little one";
    toneElement.textContent = storybook.tone || "gentle";
    pagesElement.textContent = String(Array.isArray(storybook.pages) ? storybook.pages.length : 0);
  }

  function applyLibraryPage(storybooks, cachedStory, health) {
    const titleElement = document.getElementById("library-current-title");
    const copyElement = document.getElementById("library-current-copy");
    const countElement = document.getElementById("library-story-count");
    const childElement = document.getElementById("library-latest-child");
    const backendElement = document.getElementById("library-backend-status");
    const updatedElement = document.getElementById("library-last-updated");
    const listElement = document.getElementById("library-story-list");

    if (!titleElement || !copyElement || !countElement || !childElement || !backendElement || !updatedElement || !listElement) {
      return;
    }

    const latestStory = storybooks.length ? storybooks[0] : cachedStory;
    titleElement.textContent = latestStory ? latestStory.title || "Latest storybook" : "No saved stories yet";
    copyElement.textContent = latestStory
      ? "The library is now connected to the backend story list, so recent storybooks appear here as soon as they are generated."
      : "Generate a story to populate the family library from the backend.";
    countElement.textContent = String(storybooks.length);
    childElement.textContent = latestStory ? latestStory.child_name || "the little one" : EMPTY_VALUE;
    backendElement.textContent = health
      ? health.gemini_configured
        ? "Online"
        : "API online, Gemini missing"
      : "Unavailable";
    updatedElement.textContent = latestStory ? formatDate(latestStory.created_at) : EMPTY_VALUE;

    if (!storybooks.length) {
      listElement.innerHTML = [
        '<article class="detail-card">',
        "<h3>No backend stories yet</h3>",
        "<p>Create a story from the landing page or story generation page and it will appear here automatically.</p>",
        "</article>",
      ].join("");
      return;
    }

    listElement.innerHTML = storybooks
      .slice(0, 6)
      .map(function (storybook) {
        return [
          '<article class="detail-card">',
          `<h3><a href="${escapeHtml(getStorybookUrl(storybook.id))}">${escapeHtml(storybook.title || "Storybook")}</a></h3>`,
          `<p><strong>Child:</strong> ${escapeHtml(storybook.child_name || "the little one")}</p>`,
          `<p><strong>Tone:</strong> ${escapeHtml(storybook.tone || "gentle")}</p>`,
          `<p><strong>Pages:</strong> ${escapeHtml(String(storybook.page_count || 0))}</p>`,
          `<p><strong>Created:</strong> ${escapeHtml(formatDate(storybook.created_at))}</p>`,
          "</article>",
        ].join("");
      })
      .join("");
  }

  function applyParentControlsPage(storybooks, cachedStory, health) {
    const backendElement = document.getElementById("parent-backend-status");
    const countElement = document.getElementById("parent-story-count");
    const childElement = document.getElementById("parent-current-child");
    const updatedElement = document.getElementById("parent-last-updated");
    const copyElement = document.getElementById("parent-controls-copy");

    if (!backendElement || !countElement || !childElement || !updatedElement || !copyElement) {
      return;
    }

    const latestStory = storybooks.length ? storybooks[0] : cachedStory;
    backendElement.textContent = health
      ? health.gemini_configured
        ? "Online"
        : "API online, Gemini missing"
      : "Unavailable";
    countElement.textContent = String(storybooks.length);
    childElement.textContent = latestStory ? latestStory.child_name || "the little one" : EMPTY_VALUE;
    updatedElement.textContent = latestStory ? formatDate(latestStory.created_at) : EMPTY_VALUE;
    copyElement.textContent = latestStory
      ? "Parent controls are now reading live backend state so families can review the latest story context before continuing."
      : "Once a story is generated, this page will reflect the latest family story context automatically.";
  }

  function setupConnectedPages() {
    const cachedStory = loadStorybook();
    const hasPageStoryContext = Boolean(document.getElementById("page-story-context"));
    const hasLibrarySummary = Boolean(document.getElementById("library-summary"));
    const hasParentSummary = Boolean(document.getElementById("parent-controls-summary"));
    const needsHealth = hasPageStoryContext || hasLibrarySummary || hasParentSummary;
    const needsStorybooks = hasLibrarySummary || hasParentSummary;

    if (!hasPageStoryContext && !hasLibrarySummary && !hasParentSummary) {
      return;
    }

    if (hasPageStoryContext) {
      applyPageStoryContext(cachedStory, null);
    }

    const healthPromise = needsHealth
      ? fetchHealth().catch(function () {
          return null;
        })
      : Promise.resolve(null);

    const storybooksPromise = needsStorybooks
      ? fetchStorybooks().catch(function () {
          return [];
        })
      : Promise.resolve([]);

    Promise.all([healthPromise, storybooksPromise]).then(function (results) {
      const health = results[0];
      const storybooks = results[1];

      if (hasPageStoryContext) {
        applyPageStoryContext(cachedStory, health);
      }

      if (hasLibrarySummary) {
        applyLibraryPage(storybooks, cachedStory, health);
      }

      if (hasParentSummary) {
        applyParentControlsPage(storybooks, cachedStory, health);
      }
    });
  }

  function setupGenerationPage() {
    const form = document.getElementById("story-generator-form");
    const apiBaseLabel = document.getElementById("api-base-url");

    if (apiBaseLabel) {
      apiBaseLabel.textContent = getApiBase();
    }

    if (!form) {
      return;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      generateStorybook(form);
    });
  }

  function setupStorybookPage() {
    const summary = document.getElementById("storybook-summary");
    if (!summary) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("storybookId");
    const cachedStory = loadStorybook();
    const cachedMatchesRequest =
      cachedStory && requestedId ? cachedStory.id === requestedId : Boolean(cachedStory);

    if (cachedStory) {
      applyStorybookSummary(cachedStory, cachedMatchesRequest);
      applyStorybookPages(cachedStory);
    } else {
      applyStorybookSummary(null, false);
    }

    if (!requestedId || cachedMatchesRequest) {
      return;
    }

    fetchStorybookById(requestedId)
      .then(function (storybook) {
        applyStorybookSummary(storybook, true);
        applyStorybookPages(storybook);
      })
      .catch(function (error) {
        const copyElement = document.getElementById("storybook-summary-copy");
        if (copyElement) {
          copyElement.textContent =
            error instanceof Error
              ? error.message
              : "Unable to load the requested storybook.";
        }
      });
  }

  function init() {
    setupGenerationPage();
    setupStorybookPage();
    setupConnectedPages();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

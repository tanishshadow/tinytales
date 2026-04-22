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

  function getApiBase() {
    return String(window.API_BASE || "");
  }

  function getStorybookUrl(storybookId) {
    return storybookId
      ? "storybook.html?storybookId=" + encodeURIComponent(storybookId)
      : "storybook.html";
  }

  function saveStorybook(storybook) {
    if (!storybook) {
      return;
    }
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

  function setStatus(element, message, tone) {
    if (!element) {
      return;
    }
    element.textContent = message;
    element.dataset.state = tone || "idle";
  }

  async function requestJson(path, options) {
    const response = await fetch(getApiBase() + path, options || {});
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
          : "Request failed.";
      throw new Error(detail);
    }
    return payload;
  }

  async function fetchHealth() {
    return requestJson("/api/health");
  }

  async function fetchStorybooks() {
    return requestJson("/api/storybooks");
  }

  async function fetchStorybookById(storybookId) {
    const payload = await requestJson(
      "/api/storybook/" + encodeURIComponent(storybookId)
    );
    saveStorybook(payload);
    return payload;
  }

  async function fetchPreference(path) {
    return requestJson(path);
  }

  async function savePreference(path, payload) {
    return requestJson(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  function parseCheckbox(form, name) {
    const field = form.elements.namedItem(name);
    return Boolean(field && field.checked);
  }

  function parseInterests(value) {
    return String(value || "")
      .split(",")
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);
  }

  function applyFormValues(form, values) {
    if (!form || !values) {
      return;
    }
    Object.keys(values).forEach(function (key) {
      const field = form.elements.namedItem(key);
      if (!field) {
        return;
      }
      if (field instanceof RadioNodeList) {
        return;
      }
      if (field.type === "checkbox") {
        field.checked = Boolean(values[key]);
      } else if (Array.isArray(values[key])) {
        field.value = values[key].join(", ");
      } else if (values[key] !== null && values[key] !== undefined) {
        field.value = String(values[key]);
      }
    });
  }

  function updateStoryContext(storybook, health) {
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
    copyElement.textContent =
      storybook.original_prompt || "This page is using the latest available storybook data.";
    childElement.textContent = storybook.child_name || "the little one";
    toneElement.textContent = storybook.tone || "gentle";
    pagesElement.textContent = String(
      Array.isArray(storybook.pages) ? storybook.pages.length : 0
    );
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
      ? storybook.original_prompt || "A personalized story generated by the backend."
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
    if (root && typeof window.renderStorybook === "function") {
      if (window.storybookComponent && typeof window.storybookComponent.destroy === "function") {
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

  function renderLibraryCards(storybooks) {
    const listElement = document.getElementById("library-story-list");
    if (!listElement) {
      return;
    }

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
      .slice(0, 8)
      .map(function (storybook) {
        return [
          '<article class="detail-card" data-story-id="' + escapeHtml(storybook.id) + '">',
          '<h3><a href="' + escapeHtml(getStorybookUrl(storybook.id)) + '">' + escapeHtml(storybook.title || "Storybook") + "</a></h3>",
          "<p><strong>Child:</strong> " + escapeHtml(storybook.child_name || "the little one") + "</p>",
          "<p><strong>Tone:</strong> " + escapeHtml(storybook.tone || "gentle") + "</p>",
          "<p><strong>Pages:</strong> " + escapeHtml(String(storybook.page_count || 0)) + "</p>",
          "<p><strong>Updated:</strong> " + escapeHtml(formatDate(storybook.updated_at || storybook.created_at)) + "</p>",
          '<div class="detail-card-actions">',
          '<a class="button button-secondary button-small" href="' + escapeHtml(getStorybookUrl(storybook.id)) + '">Read</a>',
          '<button class="button button-secondary button-small" type="button" data-library-action="favorite">' + (storybook.is_favorite ? "Unfavorite" : "Favorite") + "</button>",
          '<button class="button button-secondary button-small" type="button" data-library-action="share">Share</button>',
          '<button class="button button-secondary button-small" type="button" data-library-action="export">Export</button>',
          "</div>",
          "</article>",
        ].join("");
      })
      .join("");
  }

  function applyLibrarySummary(storybooks, cachedStory, health) {
    const titleElement = document.getElementById("library-current-title");
    const copyElement = document.getElementById("library-current-copy");
    const countElement = document.getElementById("library-story-count");
    const childElement = document.getElementById("library-latest-child");
    const backendElement = document.getElementById("library-backend-status");
    const updatedElement = document.getElementById("library-last-updated");

    if (!titleElement || !copyElement || !countElement || !childElement || !backendElement || !updatedElement) {
      return;
    }

    const latestStory = storybooks.length ? storybooks[0] : cachedStory;
    titleElement.textContent = latestStory ? latestStory.title || "Latest storybook" : "No saved stories yet";
    copyElement.textContent = latestStory
      ? "The library is now connected to saved story state, including favorites, shares, and printable exports."
      : "Generate a story to populate the family library from the backend.";
    countElement.textContent = String(storybooks.length);
    childElement.textContent = latestStory ? latestStory.child_name || "the little one" : EMPTY_VALUE;
    backendElement.textContent = health
      ? health.gemini_configured
        ? "Online"
        : "API online, Gemini missing"
      : "Unavailable";
    updatedElement.textContent = latestStory ? formatDate(latestStory.updated_at || latestStory.created_at) : EMPTY_VALUE;
  }

  function applyParentSummary(storybooks, cachedStory, health, dashboard) {
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
    countElement.textContent = String((dashboard && dashboard.story_count) || storybooks.length);
    childElement.textContent =
      (dashboard && dashboard.current_child) ||
      (latestStory ? latestStory.child_name || "the little one" : EMPTY_VALUE);
    updatedElement.textContent =
      (dashboard && dashboard.latest_updated_at && formatDate(dashboard.latest_updated_at)) ||
      (latestStory ? formatDate(latestStory.updated_at || latestStory.created_at) : EMPTY_VALUE);
    copyElement.textContent = latestStory
      ? "Parent controls now reflect real backend state, and you can edit the newest saved story below."
      : "Once a story is generated, this page will reflect the latest family story context automatically.";
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

    try {
      const personalization = await fetchPreference("/api/preferences/personalization").catch(function () {
        return null;
      });
      if (!String(formData.get("child_name") || "").trim() && personalization && personalization.child_name) {
        formData.set("child_name", personalization.child_name);
      } else if (!String(formData.get("child_name") || "").trim()) {
        formData.set("child_name", "the little one");
      }
    } catch (error) {
      if (!String(formData.get("child_name") || "").trim()) {
        formData.set("child_name", "the little one");
      }
    }

    submitButton.disabled = true;
    form.dataset.busy = "true";
    setStatus(status, "Generating storybook from the backend...", "loading");

    try {
      const response = await fetch(getApiBase() + "/api/generate", {
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
        throw new Error(
          payload && typeof payload.detail === "string"
            ? payload.detail
            : "The backend could not create a storybook."
        );
      }

      saveStorybook(payload);
      setStatus(status, "Storybook ready. Opening the reading view...", "success");
      window.setTimeout(function () {
        window.location.href = getStorybookUrl(payload.id);
      }, 350);
    } catch (error) {
      setStatus(
        status,
        error instanceof Error ? error.message : "Unable to reach the backend right now.",
        "error"
      );
    } finally {
      submitButton.disabled = false;
      form.dataset.busy = "false";
    }
  }

  function setupGenerationPage() {
    const form = document.getElementById("story-generator-form");
    if (!form) {
      return;
    }

    Promise.all([
      fetchPreference("/api/preferences/input").catch(function () {
        return null;
      }),
      fetchPreference("/api/preferences/personalization").catch(function () {
        return null;
      }),
      fetchPreference("/api/parent-controls").catch(function () {
        return null;
      }),
    ]).then(function (results) {
      const inputPreferences = results[0];
      const personalization = results[1];
      const parentControls = results[2];

      if (personalization && personalization.child_name) {
        const childName = form.elements.namedItem("child_name");
        if (childName && !childName.value) {
          childName.value = personalization.child_name;
        }
      }
      if (inputPreferences && inputPreferences.guided_prompt) {
        const promptField = form.elements.namedItem("prompt");
        if (promptField && !promptField.value) {
          promptField.value = inputPreferences.guided_prompt;
        }
      }
      if (parentControls && parentControls.intensity) {
        const toneField = form.elements.namedItem("tone");
        if (toneField) {
          toneField.value =
            parentControls.intensity === "balanced"
              ? "fun"
              : parentControls.intensity === "brave"
                ? "adventurous"
                : "gentle";
        }
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      generateStorybook(form);
    });
  }

  function setupGenerationVoiceInput() {
    const promptField = document.getElementById("story-prompt");
    const startButton = document.getElementById("voice-start-button");
    const stopButton = document.getElementById("voice-stop-button");
    const clearButton = document.getElementById("voice-clear-button");
    const status = document.getElementById("voice-input-status");

    if (!promptField || !startButton || !stopButton || !clearButton || !status) {
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;

    let recognition = null;
    let sessionBasePrompt = "";
    let finalTranscript = "";
    let isListening = false;
    let hasVoiceDraft = false;

    function setListeningState(listening) {
      isListening = listening;
      startButton.disabled = listening;
      stopButton.disabled = !listening;
    }

    function mergePrompt(basePrompt, transcript) {
      const cleanBase = String(basePrompt || "").trim();
      const cleanTranscript = String(transcript || "").trim();
      if (!cleanTranscript) {
        return cleanBase;
      }
      if (!cleanBase) {
        return cleanTranscript;
      }
      return cleanBase + "\n\n" + cleanTranscript;
    }

    function updatePrompt(interimTranscript) {
      promptField.value = mergePrompt(
        sessionBasePrompt,
        [finalTranscript, interimTranscript].filter(Boolean).join(" ").trim()
      );
    }

    if (!SpeechRecognition) {
      startButton.disabled = true;
      stopButton.disabled = true;
      setStatus(
        status,
        "Voice typing needs Chrome or Edge on this device.",
        "idle"
      );
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = function () {
      setListeningState(true);
      setStatus(
        status,
        "Listening now. Speak naturally and we will place it into the story prompt.",
        "loading"
      );
    };

    recognition.onresult = function (event) {
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0] ? result[0].transcript : "";
        if (result.isFinal) {
          finalTranscript = [finalTranscript, transcript].filter(Boolean).join(" ").trim();
        } else {
          interimTranscript += transcript + " ";
        }
      }
      updatePrompt(interimTranscript.trim());
    };

    recognition.onerror = function (event) {
      setListeningState(false);
      if (event.error === "not-allowed") {
        setStatus(status, "Microphone permission was blocked.", "error");
        return;
      }
      if (event.error === "no-speech") {
        setStatus(status, "No speech was heard. Try again a little closer to the mic.", "error");
        return;
      }
      setStatus(status, "Voice input stopped: " + event.error + ".", "error");
    };

    recognition.onend = function () {
      setListeningState(false);
      if (finalTranscript.trim()) {
        promptField.value = mergePrompt(sessionBasePrompt, finalTranscript);
        hasVoiceDraft = true;
        setStatus(status, "Voice text added to the story prompt.", "success");
      } else {
        promptField.value = sessionBasePrompt;
        setStatus(status, "Voice input stopped. No words were captured this time.", "idle");
      }
    };

    startButton.addEventListener("click", function () {
      sessionBasePrompt = promptField.value.trim();
      finalTranscript = "";
      hasVoiceDraft = false;
      setListeningState(true);
      try {
        recognition.start();
      } catch (error) {
        setListeningState(false);
        setStatus(status, "Voice input is already starting. Give it a second.", "idle");
      }
    });

    stopButton.addEventListener("click", function () {
      if (!isListening) {
        return;
      }
      recognition.stop();
      setStatus(status, "Finishing the voice note...", "loading");
    });

    clearButton.addEventListener("click", function () {
      if (isListening) {
        recognition.stop();
      }
      if (!hasVoiceDraft && !finalTranscript.trim()) {
        setStatus(status, "There is no added voice text to clear.", "idle");
        return;
      }
      finalTranscript = "";
      promptField.value = sessionBasePrompt;
      hasVoiceDraft = false;
      setStatus(status, "Voice-added text cleared from the prompt.", "success");
    });
  }

  function setupInputPage() {
    const form = document.getElementById("input-preferences-form");
    if (!form) {
      return;
    }
    const status = document.getElementById("input-preferences-status");

    fetchPreference("/api/preferences/input")
      .then(function (payload) {
        applyFormValues(form, payload);
        setStatus(status, "Loaded saved input preferences.", "success");
      })
      .catch(function () {
        setStatus(status, "Using the default input setup for now.", "idle");
      });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const payload = {
        input_method: form.elements.namedItem("input_method").value,
        language: form.elements.namedItem("language").value,
        guided_prompt: form.elements.namedItem("guided_prompt").value.trim(),
        voice_style: form.elements.namedItem("voice_style").value,
        notes: form.elements.namedItem("notes").value.trim(),
      };
      savePreference("/api/preferences/input", payload)
        .then(function () {
          setStatus(status, "Input preferences saved.", "success");
        })
        .catch(function (error) {
          setStatus(status, error instanceof Error ? error.message : "Unable to save.", "error");
        });
    });
  }

  function setupPersonalizationPage() {
    const form = document.getElementById("personalization-form");
    if (!form) {
      return;
    }
    const status = document.getElementById("personalization-status");

    fetchPreference("/api/preferences/personalization")
      .then(function (payload) {
        applyFormValues(form, payload);
        setStatus(status, "Loaded saved child profile.", "success");
      })
      .catch(function () {
        setStatus(status, "Start a new child profile here.", "idle");
      });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const payload = {
        child_name: form.elements.namedItem("child_name").value.trim(),
        pronouns: form.elements.namedItem("pronouns").value,
        age_range: form.elements.namedItem("age_range").value,
        avatar: form.elements.namedItem("avatar").value,
        favorite_color: form.elements.namedItem("favorite_color").value.trim(),
        favorite_animal: form.elements.namedItem("favorite_animal").value.trim(),
        comfort_object: form.elements.namedItem("comfort_object").value.trim(),
        interests: parseInterests(form.elements.namedItem("interests").value),
      };
      savePreference("/api/preferences/personalization", payload)
        .then(function () {
          setStatus(status, "Child profile saved for future stories.", "success");
        })
        .catch(function (error) {
          setStatus(status, error instanceof Error ? error.message : "Unable to save.", "error");
        });
    });
  }

  function setupAudioPage() {
    const form = document.getElementById("audio-settings-form");
    if (!form) {
      return;
    }
    const status = document.getElementById("audio-settings-status");

    fetchPreference("/api/preferences/audio")
      .then(function (payload) {
        applyFormValues(form, payload);
      })
      .catch(function () {
        setStatus(status, "Using default audio settings.", "idle");
      });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const payload = {
        narration_enabled: parseCheckbox(form, "narration_enabled"),
        narrator_voice: form.elements.namedItem("narrator_voice").value,
        playback_speed: Number(form.elements.namedItem("playback_speed").value || 1),
        background_music: form.elements.namedItem("background_music").value,
        sound_effects: parseCheckbox(form, "sound_effects"),
        parent_voice_enabled: parseCheckbox(form, "parent_voice_enabled"),
        parent_voice_note: form.elements.namedItem("parent_voice_note").value.trim(),
      };
      savePreference("/api/preferences/audio", payload)
        .then(function () {
          setStatus(status, "Audio settings saved.", "success");
        })
        .catch(function (error) {
          setStatus(status, error instanceof Error ? error.message : "Unable to save.", "error");
        });
    });
  }

  function setupExperiencePage() {
    const form = document.getElementById("experience-settings-form");
    if (!form) {
      return;
    }
    const status = document.getElementById("experience-settings-status");

    fetchPreference("/api/preferences/experience")
      .then(function (payload) {
        applyFormValues(form, payload);
      })
      .catch(function () {
        setStatus(status, "Using default reading atmosphere.", "idle");
      });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const payload = {
        mode: form.elements.namedItem("mode").value,
        theme: form.elements.namedItem("theme").value,
        text_size: form.elements.namedItem("text_size").value,
        reading_pace: form.elements.namedItem("reading_pace").value,
        auto_play_audio: parseCheckbox(form, "auto_play_audio"),
        reduced_motion: parseCheckbox(form, "reduced_motion"),
      };
      savePreference("/api/preferences/experience", payload)
        .then(function () {
          setStatus(status, "Experience settings saved.", "success");
        })
        .catch(function (error) {
          setStatus(status, error instanceof Error ? error.message : "Unable to save.", "error");
        });
    });
  }

  function collectPageEdits(form, storybook) {
    return (storybook.pages || []).map(function (page, index) {
      const field = form.elements.namedItem("page_" + (index + 1));
      return {
        page_number: page.page_number || page.pageNumber || index + 1,
        mood: page.mood || "curious",
        text: field ? String(field.value || "").trim() : page.text,
      };
    });
  }

  function setupParentControlsPage() {
    const controlsForm = document.getElementById("parent-controls-form");
    const editForm = document.getElementById("story-edit-form");
    const controlsStatus = document.getElementById("parent-controls-status");
    const editStatus = document.getElementById("story-edit-status");
    let latestStory = loadStorybook();

    if (controlsForm) {
      fetchPreference("/api/parent-controls")
        .then(function (payload) {
          applyFormValues(controlsForm, payload);
        })
        .catch(function () {
          setStatus(controlsStatus, "Using default parent controls.", "idle");
        });

      controlsForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const payload = {
          intensity: controlsForm.elements.namedItem("intensity").value,
          language: controlsForm.elements.namedItem("language").value,
          allow_sharing: parseCheckbox(controlsForm, "allow_sharing"),
          allow_exports: parseCheckbox(controlsForm, "allow_exports"),
          review_before_reading: parseCheckbox(controlsForm, "review_before_reading"),
          notes: controlsForm.elements.namedItem("notes").value.trim(),
        };
        savePreference("/api/parent-controls", payload)
          .then(function () {
            setStatus(controlsStatus, "Parent controls saved.", "success");
          })
          .catch(function (error) {
            setStatus(controlsStatus, error instanceof Error ? error.message : "Unable to save.", "error");
          });
      });
    }

    if (!editForm) {
      return;
    }

    function populateEditForm(storybook) {
      if (!storybook) {
        setStatus(editStatus, "Generate a story before editing it here.", "idle");
        return;
      }
      editForm.elements.namedItem("title").value = storybook.title || "";
      editForm.elements.namedItem("child_name").value = storybook.child_name || "";
      editForm.elements.namedItem("tone").value = storybook.tone || "gentle";
      editForm.elements.namedItem("original_prompt").value = storybook.original_prompt || "";
      for (let index = 0; index < 6; index += 1) {
        const field = editForm.elements.namedItem("page_" + (index + 1));
        if (field) {
          field.value = storybook.pages && storybook.pages[index] ? storybook.pages[index].text || "" : "";
        }
      }
    }

    populateEditForm(latestStory);

    fetchStorybooks()
      .then(function (storybooks) {
        if (storybooks.length) {
          return fetchStorybookById(storybooks[0].id);
        }
        return null;
      })
      .then(function (storybook) {
        if (storybook) {
          latestStory = storybook;
          populateEditForm(storybook);
        }
      })
      .catch(function () {
        return null;
      });

    editForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!latestStory || !latestStory.id) {
        setStatus(editStatus, "There is no saved story to edit yet.", "error");
        return;
      }

      const payload = {
        title: editForm.elements.namedItem("title").value.trim(),
        child_name: editForm.elements.namedItem("child_name").value.trim(),
        tone: editForm.elements.namedItem("tone").value,
        original_prompt: editForm.elements.namedItem("original_prompt").value.trim(),
        pages: collectPageEdits(editForm, latestStory),
      };

      requestJson("/api/storybook/" + encodeURIComponent(latestStory.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (updated) {
          latestStory = updated;
          saveStorybook(updated);
          setStatus(editStatus, "Latest story updated.", "success");
        })
        .catch(function (error) {
          setStatus(editStatus, error instanceof Error ? error.message : "Unable to update.", "error");
        });
    });
  }

  function setupLibraryActions() {
    const listElement = document.getElementById("library-story-list");
    const status = document.getElementById("library-action-status");
    if (!listElement) {
      return;
    }

    listElement.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const action = target.getAttribute("data-library-action");
      if (!action) {
        return;
      }
      const card = target.closest("[data-story-id]");
      if (!card) {
        return;
      }
      const storyId = card.getAttribute("data-story-id");
      if (!storyId) {
        return;
      }

      if (action === "favorite") {
        const makeFavorite = target.textContent !== "Unfavorite";
        requestJson("/api/storybook/" + encodeURIComponent(storyId) + "/favorite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_favorite: makeFavorite }),
        })
          .then(function () {
            setStatus(status, makeFavorite ? "Story saved as a favorite." : "Favorite removed.", "success");
            initializeConnectedPages();
          })
          .catch(function (error) {
            setStatus(status, error instanceof Error ? error.message : "Unable to update favorite.", "error");
          });
      }

      if (action === "share") {
        requestJson("/api/storybook/" + encodeURIComponent(storyId) + "/share", {
          method: "POST",
        })
          .then(function (payload) {
            const shareUrl = getApiBase() + payload.share_path;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(shareUrl).catch(function () {
                return null;
              });
            }
            setStatus(status, "Share link ready: " + shareUrl, "success");
            initializeConnectedPages();
          })
          .catch(function (error) {
            setStatus(status, error instanceof Error ? error.message : "Unable to create share link.", "error");
          });
      }

      if (action === "export") {
        requestJson("/api/storybook/" + encodeURIComponent(storyId) + "/export")
          .then(function (payload) {
            const blob = new Blob([payload.printable_text], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = (payload.title || "storybook").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") + ".txt";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(function () {
              URL.revokeObjectURL(url);
            }, 1000);
            setStatus(status, "Printable export prepared.", "success");
          })
          .catch(function (error) {
            setStatus(status, error instanceof Error ? error.message : "Unable to export.", "error");
          });
      }
    });
  }

  function setupStorybookActions(storybook) {
    const favoriteButton = document.getElementById("storybook-favorite-button");
    const shareButton = document.getElementById("storybook-share-button");
    const exportButton = document.getElementById("storybook-export-button");
    const status = document.getElementById("storybook-action-status");

    if (!favoriteButton || !shareButton || !exportButton || !status) {
      return;
    }

    if (!storybook || !storybook.id) {
      favoriteButton.disabled = true;
      shareButton.disabled = true;
      exportButton.disabled = true;
      setStatus(status, "Generate or open a saved story to use these actions.", "idle");
      return;
    }

    favoriteButton.disabled = false;
    shareButton.disabled = false;
    exportButton.disabled = false;
    favoriteButton.textContent = storybook.is_favorite ? "Remove favorite" : "Save as favorite";

    favoriteButton.onclick = function () {
      requestJson("/api/storybook/" + encodeURIComponent(storybook.id) + "/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: !storybook.is_favorite }),
      })
        .then(function () {
          storybook.is_favorite = !storybook.is_favorite;
          saveStorybook(storybook);
          setupStorybookActions(storybook);
          setStatus(status, storybook.is_favorite ? "Marked as a favorite." : "Favorite removed.", "success");
        })
        .catch(function (error) {
          setStatus(status, error instanceof Error ? error.message : "Unable to update favorite.", "error");
        });
    };

    shareButton.onclick = function () {
      requestJson("/api/storybook/" + encodeURIComponent(storybook.id) + "/share", {
        method: "POST",
      })
        .then(function (payload) {
          const shareUrl = getApiBase() + payload.share_path;
          storybook.share_id = payload.share_id;
          saveStorybook(storybook);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).catch(function () {
              return null;
            });
          }
          setStatus(status, "Share link copied: " + shareUrl, "success");
        })
        .catch(function (error) {
          setStatus(status, error instanceof Error ? error.message : "Unable to create share link.", "error");
        });
    };

    exportButton.onclick = function () {
      requestJson("/api/storybook/" + encodeURIComponent(storybook.id) + "/export")
        .then(function (payload) {
          const blob = new Blob([payload.printable_text], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = (payload.title || "storybook").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") + ".txt";
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(function () {
            URL.revokeObjectURL(url);
          }, 1000);
          setStatus(status, "Printable export downloaded.", "success");
        })
        .catch(function (error) {
          setStatus(status, error instanceof Error ? error.message : "Unable to export.", "error");
        });
    };
  }

  function setupStorybookAudio(storybook) {
    const playButton = document.getElementById("storybook-play-audio-button");
    const pauseButton = document.getElementById("storybook-pause-audio-button");
    const stopButton = document.getElementById("storybook-stop-audio-button");
    const status = document.getElementById("storybook-audio-status");

    if (!playButton || !pauseButton || !stopButton || !status) {
      return;
    }

    if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
      playButton.disabled = true;
      pauseButton.disabled = true;
      stopButton.disabled = true;
      setStatus(status, "Audio playback needs a browser with built-in speech support.", "idle");
      return;
    }

    if (!window.storyAudioController) {
      window.storyAudioController = {
        storybook: null,
        audioSettings: null,
        experienceSettings: null,
        pageIndex: 0,
        speaking: false,
        paused: false,
        utterance: null,
        autoPlayAttempted: false,
      };
    }

    const controller = window.storyAudioController;
    const previousStoryId =
      controller.storybook && controller.storybook.id ? controller.storybook.id : null;
    controller.storybook = storybook || null;
    const nextStoryId =
      controller.storybook && controller.storybook.id ? controller.storybook.id : null;
    if (previousStoryId !== nextStoryId) {
      controller.autoPlayAttempted = false;
      window.speechSynthesis.cancel();
      controller.speaking = false;
      controller.paused = false;
      controller.utterance = null;
      controller.pageIndex = 0;
    }

    function setButtonState() {
      const hasStory =
        controller.storybook &&
        Array.isArray(controller.storybook.pages) &&
        controller.storybook.pages.length > 0;
      playButton.disabled = !hasStory;
      pauseButton.disabled = !hasStory || (!controller.speaking && !controller.paused);
      stopButton.disabled = !hasStory || (!controller.speaking && !controller.paused);
      pauseButton.textContent = controller.paused ? "Resume" : "Pause";
    }

    function stopPlayback(message, tone) {
      window.speechSynthesis.cancel();
      controller.speaking = false;
      controller.paused = false;
      controller.utterance = null;
      controller.pageIndex = 0;
      setButtonState();
      if (message) {
        setStatus(status, message, tone || "idle");
      }
    }

    function getPages() {
      return controller.storybook && Array.isArray(controller.storybook.pages)
        ? controller.storybook.pages
        : [];
    }

    function getCurrentSpreadIndex() {
      if (
        window.storybookComponent &&
        typeof window.storybookComponent.getSpreadIndex === "function"
      ) {
        return window.storybookComponent.getSpreadIndex();
      }
      return 0;
    }

    function goToPage(pageIndex) {
      if (
        window.storybookComponent &&
        typeof window.storybookComponent.goToSpread === "function"
      ) {
        window.storybookComponent.goToSpread(Math.floor(pageIndex / 2));
      }
    }

    function narratorKeywords(narratorVoice) {
      if (narratorVoice === "whisper") {
        return ["whisper", "soft", "zira"];
      }
      if (narratorVoice === "playful") {
        return ["play", "joy", "aria", "samantha"];
      }
      if (narratorVoice === "adventurous") {
        return ["david", "guy", "mark", "ryan"];
      }
      return ["gentle", "soft", "zira", "aria", "samantha"];
    }

    function pickVoice(audioSettings) {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) {
        return null;
      }
      const keywords = narratorKeywords(
        audioSettings && audioSettings.narrator_voice
          ? audioSettings.narrator_voice
          : "gentle"
      );
      const exactMatch = voices.find(function (voice) {
        const haystack = (voice.name + " " + voice.lang).toLowerCase();
        return keywords.some(function (keyword) {
          return haystack.indexOf(keyword) !== -1;
        });
      });
      return exactMatch || voices.find(function (voice) {
        return String(voice.lang || "").toLowerCase().indexOf("en") === 0;
      }) || voices[0];
    }

    function getPageSpeech(page) {
      const chapter = page && page.mood ? page.mood : page && page.chapterLabel;
      const lead = chapter ? chapter + ". " : "";
      const body = page && page.text ? String(page.text).trim() : "";
      return (lead + body).trim();
    }

    function refreshAudioPreferences() {
      return Promise.all([
        fetchPreference("/api/preferences/audio").catch(function () {
          return null;
        }),
        fetchPreference("/api/preferences/experience").catch(function () {
          return null;
        }),
      ]).then(function (results) {
        controller.audioSettings = results[0];
        controller.experienceSettings = results[1];
        return results;
      });
    }

    function speakPage(pageIndex) {
      const pages = getPages();
      if (!pages.length) {
        stopPlayback("There is no story loaded yet.", "idle");
        return;
      }

      if (pageIndex >= pages.length) {
        stopPlayback("Story audio finished.", "success");
        return;
      }

      const page = pages[pageIndex];
      const text = getPageSpeech(page);

      if (!text) {
        speakPage(pageIndex + 1);
        return;
      }

      controller.pageIndex = pageIndex;
      controller.speaking = true;
      controller.paused = false;
      setButtonState();
      goToPage(pageIndex);

      const utterance = new window.SpeechSynthesisUtterance(text);
      const audioSettings = controller.audioSettings || {};
      const selectedVoice = pickVoice(audioSettings);
      utterance.rate =
        typeof audioSettings.playback_speed === "number"
          ? audioSettings.playback_speed
          : 1;
      utterance.pitch =
        audioSettings.narrator_voice === "playful"
          ? 1.08
          : audioSettings.narrator_voice === "whisper"
            ? 0.92
            : 1;
      utterance.volume = 1;
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      }

      utterance.onstart = function () {
        const pageNumber = page.page_number || page.pageNumber || pageIndex + 1;
        setStatus(status, "Reading page " + pageNumber + " aloud.", "loading");
      };

      utterance.onend = function () {
        if (!controller.speaking || controller.paused) {
          return;
        }
        speakPage(pageIndex + 1);
      };

      utterance.onerror = function () {
        stopPlayback("Audio playback stopped unexpectedly.", "error");
      };

      controller.utterance = utterance;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }

    playButton.onclick = function () {
      if (!getPages().length) {
        setStatus(status, "Generate a story first, then audio can read it aloud.", "idle");
        return;
      }

      if (controller.paused && window.speechSynthesis.paused) {
        controller.paused = false;
        controller.speaking = true;
        window.speechSynthesis.resume();
        setButtonState();
        setStatus(status, "Audio resumed.", "success");
        return;
      }

      controller.pageIndex = getCurrentSpreadIndex() * 2;
      refreshAudioPreferences().then(function () {
        speakPage(controller.pageIndex);
      });
    };

    pauseButton.onclick = function () {
      if (!controller.speaking && !controller.paused) {
        return;
      }
      if (controller.paused) {
        controller.paused = false;
        controller.speaking = true;
        window.speechSynthesis.resume();
        setStatus(status, "Audio resumed.", "success");
      } else {
        controller.paused = true;
        controller.speaking = false;
        window.speechSynthesis.pause();
        setStatus(status, "Audio paused.", "idle");
      }
      setButtonState();
    };

    stopButton.onclick = function () {
      stopPlayback("Audio stopped.", "idle");
    };

    window.onStoryFlipComplete = function (event) {
      if (!controller.speaking && !controller.paused && event) {
        controller.pageIndex = (event.spreadIndex || 0) * 2;
      }
    };

    window.addEventListener(
      "beforeunload",
      function () {
        window.speechSynthesis.cancel();
      },
      { once: true }
    );

    refreshAudioPreferences()
      .then(function () {
        const shouldAutoPlay =
          controller.audioSettings &&
          controller.audioSettings.narration_enabled &&
          controller.experienceSettings &&
          controller.experienceSettings.auto_play_audio;
        setButtonState();
        if (
          shouldAutoPlay &&
          controller.storybook &&
          !controller.autoPlayAttempted
        ) {
          controller.autoPlayAttempted = true;
          controller.pageIndex = getCurrentSpreadIndex() * 2;
          speakPage(controller.pageIndex);
        } else if (controller.storybook) {
          setStatus(status, "Audio is ready for this story.", "idle");
        } else {
          setStatus(status, "Audio is ready when a story is available.", "idle");
        }
      })
      .catch(function () {
        setButtonState();
        setStatus(status, "Audio is ready for manual playback.", "idle");
      });

    if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
      window.speechSynthesis.onvoiceschanged = function () {
        setButtonState();
      };
    }
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
      setupStorybookActions(cachedStory);
      setupStorybookAudio(cachedStory);
    } else {
      applyStorybookSummary(null, false);
      setupStorybookActions(null);
      setupStorybookAudio(null);
    }

    if (!requestedId || cachedMatchesRequest) {
      return;
    }

    fetchStorybookById(requestedId)
      .then(function (storybook) {
        applyStorybookSummary(storybook, true);
        applyStorybookPages(storybook);
        setupStorybookActions(storybook);
        setupStorybookAudio(storybook);
      })
      .catch(function (error) {
        const copyElement = document.getElementById("storybook-summary-copy");
        if (copyElement) {
          copyElement.textContent =
            error instanceof Error ? error.message : "Unable to load the requested storybook.";
        }
        setupStorybookActions(cachedStory);
      });
  }

  function initializeConnectedPages() {
    const cachedStory = loadStorybook();
    const hasPageStoryContext = Boolean(document.getElementById("page-story-context"));
    const hasLibrarySummary = Boolean(document.getElementById("library-summary"));
    const hasParentSummary = Boolean(document.getElementById("parent-controls-summary"));

    if (!hasPageStoryContext && !hasLibrarySummary && !hasParentSummary) {
      return;
    }

    Promise.all([
      fetchHealth().catch(function () {
        return null;
      }),
      fetchStorybooks().catch(function () {
        return [];
      }),
      requestJson("/api/dashboard").catch(function () {
        return null;
      }),
    ]).then(function (results) {
      const health = results[0];
      const storybooks = results[1];
      const dashboard = results[2];

      if (hasPageStoryContext) {
        updateStoryContext(cachedStory, health);
      }
      if (hasLibrarySummary) {
        applyLibrarySummary(storybooks, cachedStory, health);
        renderLibraryCards(storybooks);
      }
      if (hasParentSummary) {
        applyParentSummary(storybooks, cachedStory, health, dashboard);
      }
    });
  }

  function init() {
    setupGenerationPage();
    setupGenerationVoiceInput();
    setupInputPage();
    setupPersonalizationPage();
    setupAudioPage();
    setupExperiencePage();
    setupStorybookPage();
    setupParentControlsPage();
    setupLibraryActions();
    initializeConnectedPages();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

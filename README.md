# TinyTales

<p align="center">
  <a href="#overview">
    <img src="https://img.shields.io/badge/AI%20storybook-Gemini%20powered-F2C4CE?style=for-the-badge" alt="Gemini powered badge">
  </a>
  <a href="#features">
    <img src="https://img.shields.io/badge/Frontend-Static%20multi--page-B8E4DC?style=for-the-badge" alt="Frontend badge">
  </a>
  <a href="#api">
    <img src="https://img.shields.io/badge/API-FastAPI-A8D8D8?style=for-the-badge" alt="FastAPI badge">
  </a>
  <a href="#smart-caching">
    <img src="https://img.shields.io/badge/Cache-Same%20request%20reuse-D9C8E8?style=for-the-badge" alt="Cache badge">
  </a>
</p>

<p align="center">
  <strong>Turn little worries into gentle, personalized story adventures.</strong><br>
  Voice or text goes in, a calming multi-page storybook comes out.
</p>

<p align="center">
  <a href="https://tinytales-azure.vercel.app/">Live Frontend</a> -
  <a href="https://tinytales-2f38.onrender.com/docs">Live API Docs</a>
</p>

<p align="center">
  <a href="#overview">Overview</a> -
  <a href="#features">Features</a> -
  <a href="#quick-start">Quick Start</a> -
  <a href="#api">API</a> -
  <a href="#project-structure">Structure</a> -
  <a href="#deployment-notes">Deployment</a>
</p>

---

## Overview

TinyTales is a storybook app for turning a child's fear, worry, or bedtime feeling into a soft, magical narrative. It pairs a visual multi-page frontend with a FastAPI backend that generates stories through Gemini, stores user preferences, and now avoids wasting tokens by caching identical generation requests.

### Why it feels different

- It treats the fear honestly instead of dismissing it.
- It supports voice-style input and read-aloud playback.
- It keeps a shared family state for personalization, audio, and reading preferences.
- It reuses identical story-generation requests instead of hitting Gemini every time.

---

## Features

<table>
  <tr>
    <td width="50%">
      <h3>Input & Guidance</h3>
      <ul>
        <li>Typed prompts</li>
        <li>Live browser voice input</li>
        <li>Guided prompt preferences</li>
        <li>Language and voice-style preferences</li>
      </ul>
    </td>
    <td width="50%">
      <h3>Story Generation</h3>
      <ul>
        <li>Gemini-generated multi-page stories</li>
        <li>Emotion-aware tone selection</li>
        <li>Child name personalization</li>
        <li>Prompt normalization + request caching</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>Reading Experience</h3>
      <ul>
        <li>Custom animated storybook UI</li>
        <li>Page-flip navigation</li>
        <li>Audio read-aloud controls</li>
        <li>Saved experience preferences</li>
      </ul>
    </td>
    <td width="50%">
      <h3>Family Tools</h3>
      <ul>
        <li>Favorites</li>
        <li>Share links</li>
        <li>Printable export</li>
        <li>Persistent local JSON store</li>
      </ul>
    </td>
  </tr>
</table>

### Current frontend pages

| Page | Purpose |
| --- | --- |
| `frontend/index.html` | Landing page and product overview |
| `frontend/input.html` | Input preferences and voice-focused onboarding |
| `frontend/generation.html` | Prompt entry and story creation |
| `frontend/personalization.html` | Child profile details |
| `frontend/storybook.html` | Story reading interface |
| `frontend/audio.html` | Audio settings |
| `frontend/library.html` | Saved stories and actions |
| `frontend/experience.html` | Theme and reading mode preferences |
| `frontend/parent-controls.html` | Parent moderation and editing controls |

---

## Smart Caching

TinyTales now caches story generations by request shape so repeated prompts do not consume Gemini tokens unnecessarily.

### A request is considered the same when these match

- `prompt` after trimming and collapsing whitespace
- `child_name` after trimming and collapsing whitespace
- `tone`
- `num_pages`

### What happens on each generation

1. The backend normalizes the request.
2. It builds a SHA-256 cache key.
3. If the key already exists, the app reuses the cached generated story content.
4. If not, it calls Gemini and stores that result for future reuse.

### Important design detail

Cached generation data is stored separately from editable storybooks. That means if someone edits a saved story later, those edits do not overwrite the canonical cached result for that request.

---

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | FastAPI, Pydantic |
| AI | Google Gemini via `google-genai` |
| Persistence | Local JSON file store |
| Deployment | Vercel frontend + Render backend |

### Live deployment

- Frontend: [tinytales-azure.vercel.app](https://tinytales-azure.vercel.app/)
- Backend: [tinytales-2f38.onrender.com](https://tinytales-2f38.onrender.com/)
- API Docs: [tinytales-2f38.onrender.com/docs](https://tinytales-2f38.onrender.com/docs)

---

## Quick Start

### 1. Clone and install backend dependencies

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Add environment variables

Create `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Run the API

```bash
cd backend
uvicorn main:app --reload
```

The API will be available at:

- `http://127.0.0.1:8000`
- `http://127.0.0.1:8000/docs`

### 4. Run the frontend

Serve the `frontend` folder with any static server. For example:

```bash
cd frontend
python -m http.server 3000
```

Then open:

- `http://127.0.0.1:3000`

### 5. Point the frontend at your API

By default, the frontend reads `window.API_BASE` from [`frontend/api-config.js`](frontend/api-config.js). It also respects a `localStorage` override under `tiny.storyApiBase`.

In the browser console you can set:

```js
localStorage.setItem("tiny.storyApiBase", "http://127.0.0.1:8000");
location.reload();
```

---

## API

### Core endpoints

| Method | Route | What it does |
| --- | --- | --- |
| `POST` | `/api/generate` | Generate a new storybook or return a cached match |
| `GET` | `/api/storybooks` | List saved stories |
| `GET` | `/api/storybook/{id}` | Fetch one storybook |
| `PATCH` | `/api/storybook/{id}` | Update a saved story |
| `POST` | `/api/storybook/{id}/favorite` | Toggle favorite state |
| `POST` | `/api/storybook/{id}/share` | Create a share id |
| `GET` | `/api/storybook/{id}/export` | Export printable text |
| `GET` | `/api/shared/{share_id}` | Load a shared story |
| `GET` | `/api/health` | Health check for warm-up and deploy checks |

### Preference endpoints

- `GET/PUT /api/preferences/input`
- `GET/PUT /api/preferences/personalization`
- `GET/PUT /api/preferences/audio`
- `GET/PUT /api/preferences/experience`
- `GET/PUT /api/parent-controls`

Interactive docs:

- [`/docs`](http://127.0.0.1:8000/docs)

---

## Project Structure

```text
tiny/
|- backend/
|  |- main.py
|  |- story_generator.py
|  |- storybook.py
|  |- requirements.txt
|  `- data/
|     `- storybook_store.json
|- frontend/
|  |- index.html
|  |- generation.html
|  |- storybook.html
|  |- story-integration.js
|  |- storybook-component.js
|  |- styles.css
|  `- ...
`- README.md
```

### Key files

- [`backend/main.py`](backend/main.py): FastAPI routes, CORS, generation flow, request caching
- [`backend/story_generator.py`](backend/story_generator.py): Gemini prompt + structured story generation
- [`backend/storybook.py`](backend/storybook.py): Pydantic models, JSON persistence, generation cache store
- [`frontend/story-integration.js`](frontend/story-integration.js): Page wiring, API requests, voice input, read-aloud playback
- [`frontend/storybook-component.js`](frontend/storybook-component.js): Storybook UI and page-flip component
- [`frontend/styles.css`](frontend/styles.css): Shared visual system

---

## UX Notes

### Voice input

The story generation page supports live browser speech recognition for quickly describing things like:

- a doctor visit
- bedtime fears
- anxious moments
- “make this into a soft story” prompts

Best support is typically in Chrome or Edge.

### Audio playback

The storybook page uses browser speech synthesis for play, pause, resume, and stop controls. Voice quality depends on the system voices available on the current device.

---

## Deployment Notes

### Frontend

- Designed to be served as static files
- Works well on Vercel
- Live frontend: [https://tinytales-azure.vercel.app/](https://tinytales-azure.vercel.app/)

### Backend

- Designed for FastAPI deployment on Render
- Includes CORS support for localhost and Vercel domains
- `/api/health` can be used to warm the backend before generation
- Live backend: [https://tinytales-2f38.onrender.com/](https://tinytales-2f38.onrender.com/)
- Live docs: [https://tinytales-2f38.onrender.com/docs](https://tinytales-2f38.onrender.com/docs)

### If the frontend is still pointing to production

Set the browser override:

```js
localStorage.setItem("tiny.storyApiBase", "https://your-backend-url");
location.reload();
```

---

## Roadmap Ideas

- Uploaded audio file transcription
- Cache-hit badge in the UI
- Better share/export formatting
- Real image generation pipeline per page
- Story regeneration variants from the same prompt
- Analytics for repeated themes and comfort patterns

---

## Contributing

If you’re iterating on TinyTales, a good workflow is:

1. Run the backend locally.
2. Serve the frontend statically.
3. Use `/docs` to verify the API first.
4. Test the full browser flow after backend changes.
5. Redeploy Render if you changed API behavior or CORS.

---

## License

MIT License.

If you add a `LICENSE` file to the repo, this section will match the project license directly.

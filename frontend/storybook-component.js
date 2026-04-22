(function () {
  const doc = document;
  const win = window;
  const ROOT_ID = "storybook-root";
  const STYLE_ID = "storybook-component-styles";
  const FONT_LINK_ID = "storybook-component-fonts";
  const FLIP_DURATION_MS = 800;
  const INTERACTION_LOCK_MS = 850;
  const SWIPE_THRESHOLD = 48;
  const END_PAPER_PAGE = {
    pageNumber: "",
    text: "The tale sleeps here for now, tucked safely between the pages.",
    chapterLabel: "Endpaper",
    isEndPaper: true,
  };

  const DEFAULT_PAGES = [
    {
      pageNumber: 1,
      chapterLabel: "Chapter I",
      text:
        "When dusk brushed the windows with honey light, Mira tucked her knees beneath the blanket and listened to the little creaks of the house. They sounded larger at bedtime, as if every hallway had quietly grown a shadowy pair of shoes.",
      imagePrompt: "A moonlit attic bedroom with quilted blankets, tiny lantern stars, and a brave child listening closely.",
    },
    {
      pageNumber: 2,
      chapterLabel: "Chapter I",
      text:
        "Grandmother Elm leaned close and whispered that old homes were only telling their sleepy stories aloud. The rafters sighed, the floorboards hummed, and even the curtains knew how to rustle like pages in a kind book.",
    },
    {
      pageNumber: 3,
      chapterLabel: "Chapter II",
      text:
        "So Mira followed the sounds to the landing, where a brass key glimmered in a saucer of moonlight. It was warm as toast. On its bow, someone had engraved a curl of ivy and the words: For the room that worries visit first.",
      imagePrompt: "A glowing brass key resting in moonlight on a wooden stair landing, with soft ivy flourishes and warm dust motes.",
    },
    {
      pageNumber: 4,
      chapterLabel: "Chapter II",
      text:
        "At the linen closet door, the key turned with a polite click. Inside waited no monster at all, only a tumble of blankets, cedar perfume, and a wind-up bird that had been chirping in the dark because it had forgotten morning would come again.",
    },
    {
      pageNumber: 5,
      chapterLabel: "Chapter III",
      text:
        "Mira wound the bird gently and set it by the window. It sang one silvery note, then another, until the room felt smaller, friendlier, and stitched together by sound. Fear, she learned, was often a lonely thing asking to be named softly.",
      imagePrompt: "A child placing a tiny clockwork bird on a moonlit windowsill, silver song curling through a cozy room.",
    },
    {
      pageNumber: 6,
      chapterLabel: "Chapter III",
      text:
        "When she slipped back into bed, the house still creaked now and then, but never in a frightening voice. It sounded like a great old story settling its covers. Mira smiled into the pillow, and sleep turned the last page for her.",
    },
  ];

  function ensureFonts() {
    if (doc.getElementById(FONT_LINK_ID)) {
      return;
    }

    const link = doc.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600;700&family=MedievalSharp&display=swap";
    doc.head.appendChild(link);
  }

  function ensureStyles() {
    if (doc.getElementById(STYLE_ID)) {
      return;
    }

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
#${ROOT_ID} {
  --sb-parchment: #f5e6c8;
  --sb-edge: #e8d5a3;
  --sb-cover: #5c1a1a;
  --sb-cover-deep: #3e0f0f;
  --sb-ink: #4e3520;
  --sb-ink-soft: rgba(78, 53, 32, 0.74);
  --sb-accent: #8b1a1a;
  --sb-brass: #ad8245;
  --sb-brass-deep: #6f4d1e;
  --sb-shadow: rgba(34, 18, 9, 0.22);
  --sb-noise: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.65'/%3E%3C/svg%3E");
  position: relative;
  isolation: isolate;
  width: 100%;
  margin: clamp(28px, 4vw, 56px) auto clamp(42px, 5vw, 60px);
  color: var(--sb-ink);
  font-family: "Crimson Text", Georgia, serif;
}

#${ROOT_ID}, #${ROOT_ID} * {
  box-sizing: border-box;
}

#${ROOT_ID} button {
  font: inherit;
}

#${ROOT_ID} .sb-shell {
  display: grid;
  gap: 18px;
  justify-items: center;
}

#${ROOT_ID} .sb-stage {
  width: min(100%, 1120px);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: clamp(14px, 2vw, 24px);
}

#${ROOT_ID} .sb-nav {
  width: clamp(52px, 5vw, 64px);
  height: clamp(52px, 5vw, 64px);
  border: 1px solid rgba(82, 43, 19, 0.5);
  border-radius: 999px;
  background:
    radial-gradient(circle at 30% 28%, rgba(255, 241, 201, 0.92), rgba(198, 152, 83, 0.9) 45%, rgba(104, 64, 25, 0.98) 100%);
  box-shadow:
    inset 0 2px 5px rgba(255, 247, 225, 0.45),
    inset 0 -7px 12px rgba(82, 43, 19, 0.35),
    0 12px 20px rgba(51, 26, 11, 0.16);
  color: #2d180c;
  cursor: pointer;
  position: relative;
  transition: transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
}

#${ROOT_ID} .sb-nav::before {
  content: "";
  position: absolute;
  inset: 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 240, 205, 0.33);
}

#${ROOT_ID} .sb-nav::after {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  top: 50%;
  left: 50%;
  border-top: 3px solid currentColor;
  border-right: 3px solid currentColor;
  transform-origin: center;
}

#${ROOT_ID} .sb-nav:hover:not(:disabled) {
  transform: translateY(-2px) scale(1.02);
  box-shadow:
    inset 0 2px 5px rgba(255, 247, 225, 0.5),
    inset 0 -8px 12px rgba(82, 43, 19, 0.35),
    0 16px 26px rgba(51, 26, 11, 0.2);
}

#${ROOT_ID} .sb-nav:disabled {
  opacity: 0.45;
  cursor: default;
}

#${ROOT_ID} .sb-nav-prev::after {
  transform: translate(-35%, -50%) rotate(-135deg);
}

#${ROOT_ID} .sb-nav-next::after {
  transform: translate(-65%, -50%) rotate(45deg);
}

#${ROOT_ID} .sb-book-wrap {
  width: min(100%, 980px);
  perspective: 2000px;
  perspective-origin: 50% 46%;
}

#${ROOT_ID} .sb-book {
  position: relative;
  min-height: clamp(420px, 60vw, 700px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px minmax(0, 1fr);
  gap: 0;
  border-radius: 26px;
  padding: clamp(18px, 2vw, 24px);
  background:
    linear-gradient(180deg, rgba(255, 247, 230, 0.18), rgba(46, 9, 9, 0.06)),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0 8px, rgba(0, 0, 0, 0.03) 8px 16px),
    linear-gradient(180deg, #6d2121 0%, var(--sb-cover) 45%, var(--sb-cover-deep) 100%);
  border: 8px solid #471111;
  box-shadow:
    0 20px 40px rgba(46, 18, 10, 0.2),
    inset 0 1px 0 rgba(255, 236, 214, 0.15),
    inset 0 -2px 0 rgba(0, 0, 0, 0.18);
  overflow: hidden;
  transform-style: preserve-3d;
  transform-origin: center center;
}

#${ROOT_ID} .sb-book::after {
  content: "";
  position: absolute;
  left: 10%;
  right: 10%;
  bottom: -16px;
  height: 28px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(25, 12, 7, 0.28) 0, rgba(25, 12, 7, 0.09) 55%, transparent 80%);
  filter: blur(7px);
  pointer-events: none;
}

#${ROOT_ID} .sb-book[data-enter="true"] {
  animation: sb-book-enter 600ms ease-out both;
}

#${ROOT_ID} .sb-page-stack {
  position: relative;
  min-height: 100%;
  display: flex;
}

#${ROOT_ID} .sb-page-stack--left::before,
#${ROOT_ID} .sb-page-stack--right::before {
  content: "";
  position: absolute;
  top: 18px;
  bottom: 18px;
  width: 18px;
  z-index: 0;
  pointer-events: none;
}

#${ROOT_ID} .sb-page-stack--left::before {
  left: -7px;
  border-radius: 16px 0 0 16px;
  box-shadow:
    -2px 0 0 #d9c18b,
    -4px 0 0 #e4cf9d,
    -6px 0 0 #ccb179,
    -8px 0 0 #e9d9af;
}

#${ROOT_ID} .sb-page-stack--right::before {
  right: -7px;
  border-radius: 0 16px 16px 0;
  box-shadow:
    2px 0 0 #d9c18b,
    4px 0 0 #e4cf9d,
    6px 0 0 #ccb179,
    8px 0 0 #e9d9af;
}

#${ROOT_ID} .sb-spine {
  position: relative;
  border-inline: 2px solid rgba(255, 232, 196, 0.15);
  background:
    linear-gradient(180deg, rgba(255, 246, 221, 0.18), rgba(44, 8, 8, 0.25)),
    linear-gradient(90deg, rgba(0, 0, 0, 0.28), rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.3));
  box-shadow:
    inset 10px 0 16px rgba(0, 0, 0, 0.22),
    inset -10px 0 16px rgba(255, 232, 198, 0.06);
}

#${ROOT_ID} .sb-spine::before {
  content: "";
  position: absolute;
  top: 22px;
  bottom: 22px;
  left: 50%;
  width: 10px;
  transform: translateX(-50%);
  background:
    radial-gradient(circle, rgba(248, 224, 176, 0.9) 0 1px, transparent 1.6px) center 0 / 8px 18px repeat-y,
    linear-gradient(180deg, rgba(255, 248, 232, 0.24), rgba(69, 17, 17, 0.35));
  border-radius: 999px;
  opacity: 0.82;
}

#${ROOT_ID} .sb-page {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 100%;
  padding: clamp(28px, 4vw, 42px) clamp(20px, 3vw, 34px) 42px;
  color: var(--sb-ink);
  background:
    linear-gradient(to var(--sb-edge-direction, right), rgba(232, 213, 163, 0.58), rgba(245, 230, 200, 0.16) 10%, rgba(245, 230, 200, 0) 18%),
    linear-gradient(180deg, rgba(255, 251, 241, 0.5), rgba(232, 213, 163, 0.18)),
    repeating-linear-gradient(180deg, rgba(135, 100, 66, 0.08) 0 1px, transparent 1px 32px),
    var(--sb-noise),
    var(--sb-parchment);
  background-size: auto, auto, auto, 180px 180px, auto;
  border: 1px solid rgba(116, 81, 36, 0.22);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.24),
    0 12px 18px rgba(69, 34, 14, 0.08);
  overflow: hidden;
}

#${ROOT_ID} .sb-page--left {
  --sb-edge-direction: left;
  border-radius: 18px 4px 10px 20px;
}

#${ROOT_ID} .sb-page--right {
  --sb-edge-direction: right;
  border-radius: 4px 18px 20px 10px;
}

#${ROOT_ID} .sb-page::before,
#${ROOT_ID} .sb-page::after {
  content: "";
  position: absolute;
  pointer-events: none;
}

#${ROOT_ID} .sb-page::before {
  inset: 0;
  opacity: 0.04;
  background-image: var(--sb-noise);
  background-size: 180px 180px;
}

#${ROOT_ID} .sb-page::after {
  width: 72px;
  height: 42px;
  bottom: 8px;
  background: radial-gradient(ellipse at center, rgba(66, 34, 15, 0.24), rgba(66, 34, 15, 0.04) 55%, transparent 70%);
  filter: blur(6px);
}

#${ROOT_ID} .sb-page--left::after {
  left: 10px;
  transform: rotate(-6deg);
}

#${ROOT_ID} .sb-page--right::after {
  right: 10px;
  transform: rotate(6deg);
}

#${ROOT_ID} .sb-page-corners,
#${ROOT_ID} .sb-page-corners::before,
#${ROOT_ID} .sb-page-corners::after {
  position: absolute;
  pointer-events: none;
}

#${ROOT_ID} .sb-page-corners {
  inset: 12px;
  border-radius: inherit;
  border: 1px solid rgba(130, 94, 52, 0.16);
}

#${ROOT_ID} .sb-page-corners::before,
#${ROOT_ID} .sb-page-corners::after {
  content: "";
  width: 38px;
  height: 38px;
  border-color: rgba(111, 74, 36, 0.55);
  border-style: solid;
}

#${ROOT_ID} .sb-page-corners::before {
  left: 6px;
  top: 6px;
  border-width: 2px 0 0 2px;
  border-radius: 10px 0 0 0;
}

#${ROOT_ID} .sb-page-corners::after {
  right: 6px;
  bottom: 6px;
  border-width: 0 2px 2px 0;
  border-radius: 0 0 10px 0;
}

#${ROOT_ID} .sb-page-inner {
  position: relative;
  z-index: 1;
  width: 100%;
  display: grid;
  grid-template-rows: auto auto 1fr auto auto;
  gap: 14px;
}

#${ROOT_ID} .sb-page-header {
  display: grid;
  gap: 8px;
}

#${ROOT_ID} .sb-chapter {
  font-size: 12px;
  font-variant: small-caps;
  letter-spacing: 0.14em;
  color: rgba(84, 54, 28, 0.72);
}

#${ROOT_ID} .sb-page-title {
  margin: 0;
  font-family: "MedievalSharp", "Times New Roman", serif;
  font-size: clamp(1.5rem, 2.2vw, 2.1rem);
  line-height: 1.1;
  letter-spacing: 0.02em;
  color: #582218;
  text-shadow: 0 1px 0 rgba(255, 247, 231, 0.58);
}

#${ROOT_ID} .sb-illustration {
  min-height: 40%;
  padding: 14px;
  display: grid;
  place-items: center;
  border: 4px double rgba(86, 58, 29, 0.78);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 250, 239, 0.55), rgba(230, 207, 164, 0.35)),
    repeating-linear-gradient(45deg, rgba(140, 102, 53, 0.06) 0 5px, transparent 5px 10px);
  position: relative;
  text-align: center;
  color: rgba(92, 65, 36, 0.9);
  font-size: 0.98rem;
  font-style: italic;
}

#${ROOT_ID} .sb-illustration::before,
#${ROOT_ID} .sb-illustration::after {
  content: "";
  position: absolute;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(86, 58, 29, 0.62);
}

#${ROOT_ID} .sb-illustration::before {
  left: 8px;
  top: 8px;
  border-right: 0;
  border-bottom: 0;
}

#${ROOT_ID} .sb-illustration::after {
  right: 8px;
  bottom: 8px;
  border-left: 0;
  border-top: 0;
}

#${ROOT_ID} .sb-text {
  margin: 0;
  font-size: clamp(1.08rem, 1.55vw, 1.22rem);
  line-height: 1.9;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 0 rgba(255, 250, 241, 0.38);
}

#${ROOT_ID} .sb-text p {
  margin: 0;
}

#${ROOT_ID} .sb-text p + p {
  margin-top: 14px;
}

#${ROOT_ID} .sb-text p:first-child::first-letter {
  float: left;
  margin: 0.08em 0.12em 0 0;
  font-family: "MedievalSharp", "Times New Roman", serif;
  font-size: 3.5em;
  line-height: 0.9;
  color: var(--sb-accent);
}

#${ROOT_ID} .sb-divider {
  display: flex;
  justify-content: center;
}

#${ROOT_ID} .sb-divider svg {
  width: 110px;
  height: 18px;
  opacity: 0.62;
}

#${ROOT_ID} .sb-page-number {
  align-self: end;
  justify-self: center;
  font-size: 0.96rem;
  font-style: italic;
  color: rgba(84, 54, 28, 0.72);
}

#${ROOT_ID} .sb-endpaper {
  display: grid;
  place-items: center;
  text-align: center;
  background:
    radial-gradient(circle at 20% 20%, rgba(140, 102, 53, 0.08) 0 3px, transparent 3px),
    radial-gradient(circle at 80% 35%, rgba(140, 102, 53, 0.08) 0 3px, transparent 3px),
    linear-gradient(180deg, rgba(255, 250, 239, 0.55), rgba(230, 207, 164, 0.35)),
    repeating-linear-gradient(45deg, rgba(140, 102, 53, 0.07) 0 3px, transparent 3px 12px),
    var(--sb-parchment);
  background-size: 140px 140px, 160px 160px, auto, auto, auto;
}

#${ROOT_ID} .sb-endpaper-mark {
  width: min(72%, 240px);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 2px solid rgba(111, 74, 36, 0.36);
  box-shadow: inset 0 0 0 10px rgba(255, 246, 224, 0.24);
  background: radial-gradient(circle, rgba(255, 251, 243, 0.3), rgba(232, 213, 163, 0.16));
}

#${ROOT_ID} .sb-endpaper-mark svg {
  width: 65%;
  height: 65%;
  opacity: 0.65;
}

#${ROOT_ID} .sb-shadow-pass {
  position: absolute;
  inset: 18px 18px 18px calc(50% + 22px);
  pointer-events: none;
  z-index: 5;
  opacity: 0;
  background: linear-gradient(to left, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.08), transparent 72%);
}

#${ROOT_ID} .sb-shadow-pass[data-active="true"] {
  animation: sb-shadow-fade ${FLIP_DURATION_MS}ms linear forwards;
}

#${ROOT_ID} .sb-flip-page {
  position: absolute;
  top: 18px;
  bottom: 18px;
  width: calc(50% - 21px);
  z-index: 8;
  display: none;
  transform-style: preserve-3d;
}

#${ROOT_ID} .sb-flip-page[data-active="true"] {
  display: block;
  will-change: transform;
}

#${ROOT_ID} .sb-flip-page--forward {
  left: calc(50% + 21px);
  transform-origin: left center;
  animation: sb-flip-forward ${FLIP_DURATION_MS}ms cubic-bezier(0.645, 0.045, 0.355, 1) forwards;
}

#${ROOT_ID} .sb-flip-page--backward {
  left: 18px;
  transform-origin: right center;
  animation: sb-flip-backward ${FLIP_DURATION_MS}ms cubic-bezier(0.645, 0.045, 0.355, 1) forwards;
}

#${ROOT_ID} .sb-flip-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform-style: preserve-3d;
}

#${ROOT_ID} .sb-flip-face--back {
  transform: rotateY(180deg);
}

#${ROOT_ID} .sb-flip-face::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.75;
}

#${ROOT_ID} .sb-flip-page--forward .sb-flip-face::after {
  background: linear-gradient(to right, rgba(0, 0, 0, 0.15), transparent 38%, rgba(255, 248, 231, 0.08) 100%);
}

#${ROOT_ID} .sb-flip-page--backward .sb-flip-face::after {
  background: linear-gradient(to left, rgba(0, 0, 0, 0.15), transparent 38%, rgba(255, 248, 231, 0.08) 100%);
}

#${ROOT_ID} .sb-status {
  font-size: 1rem;
  font-style: italic;
  color: rgba(82, 56, 32, 0.88);
}

#${ROOT_ID} .sb-edge-peel {
  position: absolute;
  top: 28px;
  right: 26px;
  width: 46px;
  height: 46px;
  pointer-events: none;
  opacity: 0;
  clip-path: polygon(0 0, 100% 0, 100% 100%);
  background:
    linear-gradient(225deg, rgba(255, 252, 246, 0.82), rgba(232, 213, 163, 0.3) 45%, rgba(92, 26, 26, 0.12));
  filter: drop-shadow(-3px 3px 4px rgba(56, 28, 10, 0.12));
  transition: opacity 220ms ease, transform 220ms ease;
}

#${ROOT_ID} .sb-book[data-can-next="true"]:hover .sb-edge-peel {
  opacity: 0.9;
  transform: translate(-3px, 3px);
}

#${ROOT_ID} .sb-book[data-busy="true"] .sb-edge-peel {
  opacity: 0;
}

#${ROOT_ID} .sb-book[data-busy="true"] .sb-nav {
  pointer-events: none;
}

#${ROOT_ID} .sb-page--hidden {
  display: none;
}

@keyframes sb-book-enter {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes sb-shadow-fade {
  0% {
    opacity: 0.3;
  }
  100% {
    opacity: 0;
  }
}

@keyframes sb-flip-forward {
  0% {
    transform: rotateY(0deg) scaleY(1) translateZ(0);
  }
  30% {
    transform: rotateY(-18deg) scaleY(0.98) translateZ(8px);
  }
  60% {
    transform: rotateY(-90deg) scaleY(0.985) translateZ(12px);
  }
  90% {
    transform: rotateY(-178deg) scaleY(1) translateZ(1px);
    animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 1.4);
  }
  100% {
    transform: rotateY(-180deg) scaleY(1) translateZ(0);
  }
}

@keyframes sb-flip-backward {
  0% {
    transform: rotateY(0deg) scaleY(1) translateZ(0);
  }
  30% {
    transform: rotateY(18deg) scaleY(0.98) translateZ(8px);
  }
  60% {
    transform: rotateY(90deg) scaleY(0.985) translateZ(12px);
  }
  90% {
    transform: rotateY(178deg) scaleY(1) translateZ(1px);
    animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 1.4);
  }
  100% {
    transform: rotateY(180deg) scaleY(1) translateZ(0);
  }
}

@media (max-width: 980px) {
  #${ROOT_ID} .sb-stage {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  #${ROOT_ID} .sb-book-wrap {
    order: 1;
  }

  #${ROOT_ID} .sb-nav-row {
    order: 2;
    display: flex;
    justify-content: center;
    gap: 18px;
  }

  #${ROOT_ID} .sb-nav-desktop {
    display: none;
  }
}

@media (min-width: 981px) {
  #${ROOT_ID} .sb-nav-row {
    display: none;
  }
}

@media (max-width: 760px) {
  #${ROOT_ID} .sb-book {
    min-height: 780px;
    grid-template-columns: 1fr;
    gap: 14px;
  }

  #${ROOT_ID} .sb-spine {
    min-height: 24px;
    order: 2;
  }

  #${ROOT_ID} .sb-page-stack--left {
    order: 1;
  }

  #${ROOT_ID} .sb-page-stack--right {
    order: 3;
  }

  #${ROOT_ID} .sb-page-stack--left::before,
  #${ROOT_ID} .sb-page-stack--right::before,
  #${ROOT_ID} .sb-flip-page,
  #${ROOT_ID} .sb-shadow-pass,
  #${ROOT_ID} .sb-edge-peel {
    display: none !important;
  }

  #${ROOT_ID} .sb-page--left,
  #${ROOT_ID} .sb-page--right {
    border-radius: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  #${ROOT_ID} .sb-book[data-enter="true"],
  #${ROOT_ID} .sb-shadow-pass[data-active="true"],
  #${ROOT_ID} .sb-flip-page--forward,
  #${ROOT_ID} .sb-flip-page--backward {
    animation-duration: 1ms !important;
  }

  #${ROOT_ID} .sb-nav,
  #${ROOT_ID} .sb-edge-peel {
    transition: none;
  }
}
`;
    doc.head.appendChild(style);
  }

  function splitTextIntoParagraphs(text) {
    return String(text || "")
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  }

  function pageTitle(page) {
    if (!page || page.isEndPaper) {
      return "The Book Rests";
    }
    return page.pageNumber ? "Page " + page.pageNumber : "Story Page";
  }

  function normalizePages(storyPages) {
    const incoming = Array.isArray(storyPages) && storyPages.length ? storyPages : DEFAULT_PAGES;
    return incoming.map(function (page, index) {
      const rawMood = typeof page.mood === "string" ? page.mood.trim() : "";
      return {
        pageNumber: page.pageNumber ?? page.page_number ?? index + 1,
        text: String(page.text || ""),
        imagePrompt: page.imagePrompt ? String(page.imagePrompt) : "",
        chapterLabel:
          page.chapterLabel ||
          (rawMood ? "Mood " + rawMood.charAt(0).toUpperCase() + rawMood.slice(1).toLowerCase() : "Chapter " + romanize(Math.floor(index / 2) + 1)),
      };
    });
  }

  function romanize(value) {
    const map = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];
    let remaining = Math.max(1, value);
    let output = "";
    map.forEach(function (entry) {
      while (remaining >= entry[0]) {
        remaining -= entry[0];
        output += entry[1];
      }
    });
    return output;
  }

  function createFlourish() {
    return `
      <svg viewBox="0 0 120 20" aria-hidden="true" focusable="false">
        <path d="M4 10h27c7 0 8-6 13-6s6 6 16 6 11-6 16-6 6 6 13 6h27" fill="none" stroke="#7c5630" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="60" cy="10" r="2.2" fill="#8b1a1a"/>
      </svg>
    `;
  }

  function createEndpaperMarkup(pagePosition) {
    return `
      <div class="sb-page sb-page--${pagePosition} sb-endpaper">
        <div class="sb-page-corners" aria-hidden="true"></div>
        <div class="sb-page-inner">
          <div class="sb-page-header">
            <span class="sb-chapter">Endpaper</span>
            <h3 class="sb-page-title">The Last Little Pattern</h3>
          </div>
          <div class="sb-endpaper-mark" aria-hidden="true">
            <svg viewBox="0 0 100 100">
              <path d="M50 18c10 12 22 18 22 31 0 10-7 18-17 18-8 0-13-5-13-10 0 8-7 14-16 14-9 0-16-7-16-16 0-15 16-24 40-37z" fill="none" stroke="#7c5630" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M34 64c4 7 11 12 20 12 12 0 22-8 25-20" fill="none" stroke="#8b1a1a" stroke-width="2.4" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="sb-divider">${createFlourish()}</div>
          <div class="sb-page-number">${pagePosition === "left" ? "Finis" : ""}</div>
        </div>
      </div>
    `;
  }

  function createPageMarkup(page, pagePosition) {
    if (!page) {
      return createEndpaperMarkup(pagePosition);
    }

    if (page.isEndPaper) {
      return createEndpaperMarkup(pagePosition);
    }

    const paragraphs = splitTextIntoParagraphs(page.text);
    const textMarkup = paragraphs.length
      ? paragraphs
          .map(function (paragraph) {
            return "<p>" + escapeHtml(paragraph) + "</p>";
          })
          .join("")
      : "<p></p>";

    const illustrationMarkup = page.imagePrompt
      ? `
        <div class="sb-illustration">
          <span>${escapeHtml(page.imagePrompt)}</span>
        </div>
      `
      : "";

    return `
      <div class="sb-page sb-page--${pagePosition}">
        <div class="sb-page-corners" aria-hidden="true"></div>
        <div class="sb-page-inner">
          <div class="sb-page-header">
            <span class="sb-chapter">${escapeHtml(page.chapterLabel)}</span>
            <h3 class="sb-page-title">${escapeHtml(pageTitle(page))}</h3>
          </div>
          ${illustrationMarkup}
          <div class="sb-divider">${createFlourish()}</div>
          <div class="sb-text">${textMarkup}</div>
          <div class="sb-page-number">${escapeHtml(String(page.pageNumber))}</div>
        </div>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getSpread(pages, spreadIndex) {
    const safeIndex = Math.max(0, Math.min(spreadIndex, Math.ceil(pages.length / 2) - 1));
    const leftIndex = safeIndex * 2;
    const rightIndex = leftIndex + 1;
    return {
      spreadIndex: safeIndex,
      left: pages[leftIndex] || null,
      right: pages[rightIndex] || null,
      leftIndex: leftIndex,
      rightIndex: rightIndex,
    };
  }

  function renderStorybook(rootElement, options) {
    ensureFonts();
    ensureStyles();

    const pages = normalizePages(options.storyPages);
    const onFlipComplete = typeof options.onFlipComplete === "function" ? options.onFlipComplete : null;
    const state = {
      spreadIndex: 0,
      isFlipping: false,
      flipDirection: null,
      entered: false,
      touchStartX: 0,
      cleanupTimers: [],
    };

    function totalSpreads() {
      return Math.ceil(pages.length / 2);
    }

    function canGoNext() {
      return state.spreadIndex < totalSpreads() - 1;
    }

    function canGoPrev() {
      return state.spreadIndex > 0;
    }

    function preloadSpreadModels() {
      const neighbors = [state.spreadIndex - 1, state.spreadIndex, state.spreadIndex + 1];
      return neighbors
        .filter(function (index) {
          return index >= 0 && index < totalSpreads();
        })
        .map(function (index) {
          return getSpread(pages, index);
        });
    }

    function currentLabel(spread) {
      const start = spread.left ? spread.left.pageNumber : pages.length;
      const end = spread.right ? spread.right.pageNumber : start;
      return "Page " + start + (end !== start ? "–" + end : "") + " of " + pages.length;
    }

    function buildFlipOverlayMarkup(direction, currentSpread, nextSpread) {
      if (win.matchMedia("(max-width: 760px)").matches) {
        return "";
      }

      let frontPage = null;
      let backPage = null;
      let flipClass = "";

      if (direction === "forward") {
        frontPage = currentSpread.right || currentSpread.left;
        backPage = nextSpread.left || END_PAPER_PAGE;
        flipClass = "sb-flip-page--forward";
      } else {
        frontPage = currentSpread.left || currentSpread.right;
        backPage = nextSpread.right || END_PAPER_PAGE;
        flipClass = "sb-flip-page--backward";
      }

      if (!frontPage) {
        return "";
      }

      const frontPosition = direction === "forward" ? "right" : "left";
      const backPosition = direction === "forward" ? "right" : "left";

      return `
        <div class="sb-flip-page ${flipClass}" data-active="true" aria-hidden="true">
          <div class="sb-flip-face sb-flip-face--front">
            ${createPageMarkup(frontPage, frontPosition)}
          </div>
          <div class="sb-flip-face sb-flip-face--back">
            ${createPageMarkup(backPage, backPosition)}
          </div>
        </div>
      `;
    }

    function rerender(pendingFlip) {
      const spread = getSpread(pages, state.spreadIndex);
      const preloaded = preloadSpreadModels();
      const busy = !!pendingFlip;
      const baseSpread = pendingFlip ? pendingFlip.toSpread : spread;
      const leftMarkup = createPageMarkup(baseSpread.left, "left");
      const rightMarkup = baseSpread.right
        ? createPageMarkup(baseSpread.right, "right")
        : createEndpaperMarkup("right");
      const flipMarkup = pendingFlip
        ? buildFlipOverlayMarkup(pendingFlip.direction, pendingFlip.fromSpread, pendingFlip.toSpread)
        : "";
      const mobileNav = `
        <div class="sb-nav-row" aria-label="Page navigation">
          <button class="sb-nav sb-nav-prev" type="button" data-action="prev" aria-label="Previous pages" ${canGoPrev() && !busy ? "" : "disabled"}></button>
          <button class="sb-nav sb-nav-next" type="button" data-action="next" aria-label="Next pages" ${canGoNext() && !busy ? "" : "disabled"}></button>
        </div>
      `;

      rootElement.innerHTML = `
        <div class="sb-shell">
          <div class="sb-stage">
            <button class="sb-nav sb-nav-prev sb-nav-desktop" type="button" data-action="prev" aria-label="Previous pages" ${canGoPrev() && !busy ? "" : "disabled"}></button>
            <div class="sb-book-wrap">
              <div class="sb-book" data-enter="${state.entered ? "false" : "true"}" data-busy="${busy ? "true" : "false"}" data-can-next="${canGoNext() ? "true" : "false"}">
                <div class="sb-page-stack sb-page-stack--left">
                  ${leftMarkup}
                </div>
                <div class="sb-spine" aria-hidden="true"></div>
                <div class="sb-page-stack sb-page-stack--right">
                  ${rightMarkup}
                </div>
                <div class="sb-shadow-pass" data-active="${pendingFlip ? "true" : "false"}"></div>
                ${flipMarkup}
                <div class="sb-edge-peel" aria-hidden="true"></div>
              </div>
            </div>
            <button class="sb-nav sb-nav-next sb-nav-desktop" type="button" data-action="next" aria-label="Next pages" ${canGoNext() && !busy ? "" : "disabled"}></button>
            ${mobileNav}
          </div>
          <div class="sb-status">${escapeHtml(currentLabel(spread))}</div>
        </div>
      `;

      state.entered = true;
      rootElement.dataset.preloaded = preloaded
        .map(function (entry) {
          return [entry.leftIndex, entry.rightIndex].join(":");
        })
        .join("|");

      bindEvents();
    }

    function clearTimers() {
      state.cleanupTimers.forEach(function (timerId) {
        win.clearTimeout(timerId);
      });
      state.cleanupTimers = [];
    }

    function finishFlip(direction, completedSpread) {
      state.isFlipping = false;
      state.flipDirection = null;
      rerender(null);
      if (onFlipComplete) {
        onFlipComplete({
          direction: direction,
          spreadIndex: completedSpread.spreadIndex,
          pages: [completedSpread.left, completedSpread.right].filter(Boolean),
        });
      }
    }

    function startFlip(direction) {
      if (state.isFlipping) {
        return;
      }

      if (direction === "forward" && !canGoNext()) {
        return;
      }

      if (direction === "backward" && !canGoPrev()) {
        return;
      }

      const fromSpread = getSpread(pages, state.spreadIndex);
      const nextIndex = direction === "forward" ? state.spreadIndex + 1 : state.spreadIndex - 1;
      state.spreadIndex = nextIndex;
      const toSpread = getSpread(pages, state.spreadIndex);
      state.isFlipping = true;
      state.flipDirection = direction;
      rerender({
        direction: direction,
        fromSpread: fromSpread,
        toSpread: toSpread,
      });

      clearTimers();
      state.cleanupTimers.push(
        win.setTimeout(function () {
          const flippingPage = rootElement.querySelector(".sb-flip-page[data-active='true']");
          if (flippingPage) {
            flippingPage.style.willChange = "auto";
          }
        }, FLIP_DURATION_MS)
      );
      state.cleanupTimers.push(
        win.setTimeout(function () {
          finishFlip(direction, toSpread);
        }, INTERACTION_LOCK_MS)
      );
    }

    function bindEvents() {
      const prevButtons = rootElement.querySelectorAll('[data-action="prev"]');
      const nextButtons = rootElement.querySelectorAll('[data-action="next"]');

      prevButtons.forEach(function (button) {
        button.onclick = function () {
          startFlip("backward");
        };
      });

      nextButtons.forEach(function (button) {
        button.onclick = function () {
          startFlip("forward");
        };
      });
    }

    function onKeyDown(event) {
      if (!rootElement.isConnected) {
        return;
      }

      const target = event.target;
      const isTypingField =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (isTypingField) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        startFlip("forward");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        startFlip("backward");
      }
    }

    function onTouchStart(event) {
      state.touchStartX = event.changedTouches[0].clientX;
    }

    function onTouchEnd(event) {
      const deltaX = event.changedTouches[0].clientX - state.touchStartX;
      if (Math.abs(deltaX) < SWIPE_THRESHOLD) {
        return;
      }
      if (deltaX < 0) {
        startFlip("forward");
      } else {
        startFlip("backward");
      }
    }

    rerender(null);
    rootElement.addEventListener("touchstart", onTouchStart, { passive: true });
    rootElement.addEventListener("touchend", onTouchEnd, { passive: true });
    win.addEventListener("keydown", onKeyDown);

    return {
      destroy: function () {
        clearTimers();
        rootElement.removeEventListener("touchstart", onTouchStart);
        rootElement.removeEventListener("touchend", onTouchEnd);
        win.removeEventListener("keydown", onKeyDown);
      },
      getSpreadIndex: function () {
        return state.spreadIndex;
      },
      goToSpread: function (spreadIndex) {
        const clampedIndex = Math.max(
          0,
          Math.min(Math.ceil(pages.length / 2) - 1, Number(spreadIndex) || 0)
        );
        clearTimers();
        state.isFlipping = false;
        state.flipDirection = null;
        state.spreadIndex = clampedIndex;
        rerender(null);
      },
      goNext: function () {
        startFlip("forward");
      },
      goPrev: function () {
        startFlip("backward");
      },
    };
  }

  function boot() {
    const rootElement = doc.getElementById(ROOT_ID);
    if (!rootElement) {
      return;
    }

    const storyPages = Array.isArray(win.storyPages) ? win.storyPages : DEFAULT_PAGES;
    if (win.storybookComponent && typeof win.storybookComponent.destroy === "function") {
      win.storybookComponent.destroy();
    }

    win.renderStorybook = function (mountNode, options) {
      return renderStorybook(mountNode, options || {});
    };

    win.storybookComponent = renderStorybook(rootElement, {
      storyPages: storyPages,
      onFlipComplete: typeof win.onStoryFlipComplete === "function" ? win.onStoryFlipComplete : null,
    });
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

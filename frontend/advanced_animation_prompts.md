# Advanced Animation Prompts — "Where Colors Dream"

> **Context**: These 5 prompts describe animation systems to be layered **on top of** the existing "Where Colors Dream" UI — a children's storybook app with a dreamy, watercolor-pastel aesthetic (`--petal-pink`, `--powder-mint`, `--chalk-lavender`, `--warm-cream`, `--dusk-aqua`). The existing codebase already has: custom cursor with magnetic hover & spring physics, smooth-scroll hijack with lerp, multi-layer parallax with CSS perspective tilt, word-by-word `IntersectionObserver` text reveal with blur, ambient breathing CSS animations, glass-refraction light tracking, canvas particle-morph page transitions, and FLIP-based link ghosts. **Each prompt below is 4× more layered and technically complex than any single existing system.** No content, layout, or UI should be changed — these are pure animation overlays.

---

## Prompt 1 — WebGL Watercolor Ink Diffusion Background

**What it does**: Replace the current static `radial-gradient` ambient background (`body.has-gradient-motion::before`) with a **real-time WebGL fluid simulation** rendered to a full-viewport `<canvas>` behind all content. The simulation models ink dropped into water — soft, organic color plumes that drift, merge, bleed, and dissipate in slow motion, using the project's palette colors (`#f2c4ce`, `#b8e4dc`, `#d9c8e8`, `#f5e6c0`, `#a8d8d8`).

> **CRITICAL — OPAQUE RENDERING**: The canvas MUST render a fully opaque background at all times. The composite shader's final output MUST always write `gl_FragColor.a = 1.0`. The canvas element MUST be created with `{ alpha: false }` passed to `getContext("webgl2")` (or `"webgl"`). The canvas CSS MUST include `background: #faf6f0` as a fallback. Without these three requirements, the background will appear transparent/invisible.

> **CRITICAL — PERFORMANCE**: The simulation runs at **1/8th viewport resolution** (e.g., 256×144 on a 2048×1152 viewport). No bloom pass. No vorticity confinement. Pressure-solve iterations capped at 12 (not 20+). Splats injected every 3rd frame, not every frame. The composite pass upscales the low-res dye texture with bilinear filtering, which naturally produces the soft watercolor look without expensive post-processing.

**Technical layers (6 total — reduced from 8 for performance)**:

1. **Simplified Navier-Stokes fluid solver** running on the GPU via fragment shaders at **1/8th viewport resolution** (e.g., 256×144 framebuffers). Use ping-pong FBO pairs for velocity and dye fields. The solver runs 3 steps per frame: (a) advect velocity, (b) solve pressure with **12 Jacobi iterations** (not 20+), (c) advect dye. Diffusion is handled implicitly via numerical dissipation — no separate diffusion pass needed. Viscosity is baked into the advection timestep (`dt = 0.016`). All FBOs use `gl.RGBA` with `gl.HALF_FLOAT_OES` (or `gl.FLOAT` with fallback). **Both the WebGL context AND every FBO must use `alpha: false` or ensure alpha is always 1.0.**

2. **Dye injection system**: Every **3rd animation frame**, inject 1–2 circular "dye splats" at slowly-drifting positions. Positions follow simple sine-wave paths (`x += sin(time * 0.0004 + seed) * 0.3`, `y += cos(time * 0.0003 + seed) * 0.2`) — no Perlin noise needed. Each splat picks a color from the palette, has a radius of 20–50px in simulation-space, and uses a quadratic falloff (`1.0 - smoothstep(0.0, radius, dist)`). Colors are injected at **full intensity** (RGB values 0.6–0.95, never near-zero) so the dye is clearly visible.

3. **Cursor interaction layer**: On `mousemove` (throttled to every 32ms), inject a dye splat at the cursor position with color `rgb(229, 198, 221)` (50/50 blend of petal-pink and chalk-lavender) and add a velocity impulse in the mouse-movement direction. Impulse magnitude = `clamp(mouseSpeed * 0.15, 0, 8)`. This creates visible ink-trail wakes without overwhelming the sim.

4. **Scroll-coupled dynamics**: As `state.currentScroll` increases from 0 → `state.maxScroll`, linearly scale two uniforms: (a) `u_dissipation` from 0.997 (colors persist) to 0.985 (colors fade faster), and (b) splat radius from 50 → 30 (tighter swirls at bottom). This is just two uniform updates per frame — near-zero cost.

5. **OPAQUE composite shader**: The final full-screen pass samples the low-res dye FBO and composites it onto a **solid opaque base color** `vec3(0.98, 0.965, 0.941)` (#faf6f0). The shader does:
   ```glsl
   vec3 base = vec3(0.98, 0.965, 0.941);  // #faf6f0
   vec3 dye = texture2D(u_dye, uv).rgb;
   // soft-light blend
   vec3 result = mix(base, base * (1.0 + (dye - 0.5) * 0.7), 0.55);
   // static grain (not animated — no per-frame cost)
   float grain = fract(sin(dot(uv * 800.0, vec2(12.9898, 78.233))) * 43758.5453) * 0.04;
   result += grain - 0.02;
   gl_FragColor = vec4(result, 1.0);  // ALWAYS alpha = 1.0
   ```
   The bilinear upscale from 1/8th resolution naturally creates the soft watercolor bleed — no bloom pass needed.

6. **Performance governor**: Maintain a rolling 30-frame average of `requestAnimationFrame` delta times. If average exceeds 22ms (below 45fps), halve the simulation resolution again to 1/16th and reduce splat injection to every 6th frame. On `prefers-reduced-motion`, skip the entire WebGL system and let the existing CSS gradient remain. On WebGL context loss, fall back gracefully.

**2D Canvas fallback** (when WebGL is unavailable): Draw 5–8 large radial gradients with palette colors onto a 2D canvas at 1/4 resolution. On each frame, slowly shift gradient positions with sine-wave motion and redraw. Composite over a solid `#faf6f0` fillRect. Apply a single `ctx.globalCompositeOperation = "soft-light"` pass. This is visually close enough and runs on any device. **The fallback canvas MUST also call `ctx.fillRect(0, 0, width, height)` with `#faf6f0` as the FIRST draw call every frame** to guarantee opacity.

**Integration point**: The `<canvas>` is appended as the first child of `<body>` with `position: fixed; inset: 0; z-index: 0; pointer-events: none; background: #faf6f0;`. CSS adds `body.has-webgl-ink .grain-overlay { display: none; }` and `body.has-webgl-ink::before { display: none; }` to hide the old gradient and grain when the WebGL canvas is active. The body gets class `has-webgl-ink` only after the first successful frame renders. The simulation ticks inside the existing `animationFrame()` loop after `updateParallax()`. The canvas z-index is `0` (not `-2`) so it sits behind `.site-shell` (z-index `1`) but above nothing — this prevents stacking-context issues that cause transparency.

---

## Prompt 2 — Scroll-Driven SVG Morphing & Path Distortion Engine

**What it does**: Every SVG illustration in the project (hero figure, bubbles, orbs, mountains, feature icons — 15+ distinct SVG groups) **continuously morphs and distorts** in response to scroll position, scroll velocity, and scroll direction. Paths stretch, melt, wobble, and reform like living watercolor brushstrokes. This is not simple `transform` animation — the actual `d` attribute path data is interpolated and distorted per-frame.

**Technical layers (minimum 10)**:

1. **Path parsing & normalization**: On init, parse every `<path>` and `<circle>` SVG element's geometry into a normalized cubic-Bézier representation. Circles are converted to 4-segment cubic arcs. All paths are resampled to a uniform point count (e.g., 64 evenly-spaced samples along each path) so they can be interpolated 1:1.
2. **Keyframe shape library**: For each SVG group, define 3 shape states: (A) the original "rest" path data, (B) a "stretched" variant where control points are displaced outward along their normals by 8–20px (computed from the path's per-point normals), and (C) a "melted" variant where control points are displaced downward with a sine-wave modulation applied horizontally. These variants are pre-computed at init.
3. **Scroll-position interpolation**: Map each SVG's vertical position (relative to the viewport) to a 0→1 progress value. Use this to blend between states A→B as the element enters the viewport (bottom 30% → center), and B→C as it exits (center → top 30%). Blending is per-control-point linear interpolation of the cubic-Bézier coordinates.
4. **Scroll-velocity distortion**: Compute scroll velocity (`state.targetScroll - state.currentScroll` per frame). Apply a "velocity warp" to all visible SVG points: displace each point perpendicular to the scroll direction by `velocity * sin(pointIndex * 0.3 + time * 2) * 0.4` pixels. This creates a wobbly, jelly-like deformation when scrolling fast that settles when scrolling stops.
5. **Directional skew**: When scroll direction changes (up vs. down), apply a brief directional skew to each SVG's bounding box: a CSS `skewY(±2deg)` with a spring-physics decay (stiffness 180, damping 12) so the shapes "lean" into the scroll direction and spring back.
6. **Per-path stroke animation**: Animate each path's `stroke-dashoffset` from 100% to 0% as the element enters viewport, synchronized with the morph — so the shape appears to be "drawn" while morphing into view.
7. **Noise-based anchor jitter**: Apply a low-frequency 2D Simplex noise displacement to each control point at all times (even when not scrolling), with an amplitude of 1–3px and frequency of 0.005, so shapes never feel fully static — they have a hand-drawn, living tremor.
8. **Hero figure special treatment**: The hero figure SVG (`.hero-illustration`) gets an additional layer: its hair, dress, and skin paths morph independently with different scroll-speed multipliers (hair: 1.5×, dress: 1.2×, skin: 0.8×), and the bubble-wand path traces an arc whose angle is driven by horizontal mouse position (mapped to ±15° rotation), making the character appear to point the wand toward the cursor.
9. **Feature icon reactivity**: Feature card SVGs (`.feature svg`) morph more aggressively on their parent `.feature:hover` — all control points explode outward by 12px with a spring return (stiffness 200, damping 10), creating a "pop" effect that goes far beyond the current breathing animation.
10. **GPU-accelerated rendering**: All path string reconstructions (`d` attribute writes) are batched into a single `requestAnimationFrame` callback. Use a typed Float32Array to store all point data and perform interpolations, avoiding GC pressure. Implement a spatial hash to skip off-screen SVGs entirely.

**Integration point**: Runs as a new `updateSVGMorphing(scrollValue)` function called inside `animationFrame()` after `updateParallax()`. All SVG elements are collected at init into a `morphTargets[]` array alongside their pre-parsed keyframe data.

---

## Prompt 3 — Volumetric Parallax Depth with Atmospheric Fog & Light Rays

**What it does**: Transform the existing flat parallax system into a **full volumetric 3D depth scene** using layered CSS `transform: translateZ()` with true `perspective` rendering, plus a custom **atmospheric fog shader** and **animated god-ray light beams** that respond to scroll and cursor, creating the illusion that the page content exists inside a softly lit, misty storybook diorama.

**Technical layers (minimum 9)**:

1. **True Z-depth separation**: Replace the current `translate3d(x, y, 0)` parallax transforms with proper `translateZ()` values on a shared `perspective(1200px)` container. Assign 5 depth layers: Layer 0 (fog/atmosphere, z: -400px), Layer 1 (gradient background, z: -200px), Layer 2 (SVG orbs & mountains, z: -80px), Layer 3 (main content — text, cards, z: 0px), Layer 4 (hero illustration foreground, z: +60px). Compensate each layer's `scale` to maintain visual size at its depth (`scale = 1 + z/perspective`).
2. **CSS 3D scene container**: Wrap `.site-shell` in a new `<div class="depth-scene">` with `transform-style: preserve-3d; perspective: 1200px; perspective-origin: 50% var(--pov-y);` where `--pov-y` is dynamically updated based on scroll position (top of page = 30%, bottom = 70%), creating a subtle vertical parallax shift in the vanishing point itself.
3. **Atmospheric fog overlay**: A full-viewport `<canvas>` rendered with a fragment shader that computes per-pixel fog density based on the element's Z-depth (read from a pre-rendered depth map). The fog color transitions from warm cream (`#f5e6c0` at opacity 0.3) at the "far" layer to fully transparent at the "near" layer. Fog density increases nonlinearly with distance using an exponential falloff: `fogFactor = 1.0 - exp(-density * depth * depth)`.
4. **Scroll-driven fog density**: As the user scrolls deeper into the page, globally increase the fog `density` uniform from 0.002 to 0.006, making the background progressively hazier — as if the reader is "going deeper" into the storybook world.
5. **God-ray light beams**: Render 3–5 volumetric light shafts using a radial-blur post-process technique: (a) render bright spots to a small offscreen FBO where each "light source" is positioned at the top-right of the hero section and at the center of the quote-band section, (b) apply 12-sample radial blur outward from each light position, (c) composite the result over the scene with `screen` blending at ~15% opacity. The light sources are placed at fixed world-positions but, because they exist in the 3D scene, they parallax naturally with scroll.
6. **Cursor-driven light direction**: The primary god-ray source pivots ±20° based on horizontal mouse position (mapped from viewport edges to [-1, 1]), so the light beams subtly follow the user's gaze, casting shifting highlights across the fog.
7. **Depth-of-field blur**: Apply a per-layer Gaussian blur that increases with distance from the "focus plane" (Layer 3, the content). Layer 2 gets `blur(1.5px)`, Layer 1 gets `blur(3px)`, Layer 0 gets `blur(6px)`, Layer 4 gets `blur(0.8px)`. These are CSS filters applied via `style.filter` and interpolated when the focus plane shifts (e.g., when a feature card is hovered, shift focus to Layer 2 momentarily to blur the foreground).
8. **Particle dust motes**: Spawn 60–100 tiny (2–4px) semi-transparent circles as absolutely-positioned `<div>`s distributed across all depth layers. Each mote drifts on a unique Perlin noise path at 0.1–0.5px/frame, with occasional "sparkle" opacity flickers (opacity oscillates between 0.15 and 0.5 on a sin wave with per-mote phase offset). Motes on deeper layers move slower (parallax-consistent) and are foggier.
9. **Dynamic shadow casting**: Each content card (`.feature`, `.detail-card`) receives a `box-shadow` whose offset-x and offset-y are computed based on the card's screen-space position relative to the god-ray light source. Cards closer to the light get shorter, sharper shadows; cards further get longer, softer shadows. Shadow color is `rgba(42, 33, 24, 0.06–0.14)`. Updated per-frame in the main animation loop.

**Integration point**: The depth-scene wrapper is injected via JS at init (wrapping `.site-shell`). The fog canvas and god-ray canvas are layered using `position: fixed; z-index` values between the depth layers. The existing parallax system is extended (not replaced) — current `updateParallax()` gains a `translateZ` component per layer.

---

## Prompt 4 — Cursor-Reactive Constellation Particle Field with SVG Thread Lines

**What it does**: Overlay the **entire page** with a persistent, semi-transparent particle field of 200–300 tiny "star" particles that drift slowly and connect to each other (and to the cursor) with fine SVG `<line>` threads when within proximity — forming a living, breathing **constellation map** that reacts to mouse movement, scroll, and hover states. Think of it as a dreamy neural-network visualization woven into the storybook atmosphere.

**Technical layers (minimum 10)**:

1. **Particle system architecture**: Create a fixed-position SVG element (`<svg class="constellation-field">`) spanning the full viewport. Spawn 250 particles, each represented as a `<circle>` with radius 1.5–3px and fill color randomly picked from the palette with low opacity (0.12–0.35). Store particle state in a flat `Float32Array` for cache-friendly iteration: `[x, y, vx, vy, baseRadius, currentRadius, opacity, hue, noisePhaseX, noisePhaseY]` per particle.
2. **Perlin noise drift**: Each particle drifts according to a 2D curl-noise field (derived from 2D Perlin noise gradients rotated 90°). The noise field is sampled at each particle's position with a low frequency (0.001) and the resulting velocity is scaled to ~0.15px/frame. This creates organic, non-random, swirling drift patterns. The noise field's time offset advances at 0.0003 per frame, so the flow pattern evolves over minutes.
3. **Scroll velocity injection**: When the user is actively scrolling, add a global downward velocity component to all particles proportional to `scrollVelocity * 0.08`. This makes the star field "rush" past during fast scrolls (like stars in a car window). Apply an exponential decay (factor 0.92/frame) so particles settle back to noise-driven drift after scrolling stops.
4. **Cursor attraction/repulsion zone**: Define a 180px-radius zone around the cursor. Particles within this zone experience two competing forces: (a) a gentle attraction toward the cursor at very close range (< 60px, force ∝ 1/distance²), causing nearby stars to orbit the cursor, and (b) a soft repulsion at medium range (60–180px, force ∝ distance), pushing particles away and creating a "cleared halo" effect. The balance creates a dynamic ring of orbiting particles around the cursor.
5. **Proximity-based SVG thread connections**: On every frame, compute pairwise distances between all particles (optimized with a spatial grid of 120px cells to reduce O(n²) to ~O(n)). For every pair within 100px, render an SVG `<line>` with: stroke color = blend of both particles' colors at 50%, stroke-opacity = `(1 - distance/100) * 0.18`, stroke-width = 0.5px. Cap at 400 visible lines to prevent GPU overload. Lines are pooled (pre-created and reused via `display: none` toggling).
6. **Cursor thread connections**: Additionally, draw lines from the cursor to every particle within 150px (up to 15 lines). These cursor-lines use a brighter stroke (`--teal-wash` at 0.3 opacity) and animate their `stroke-dasharray` with a slow scrolling dash pattern (`4 8`, offset advancing 0.5px/frame) to create a "data stream" effect.
7. **Hover-state constellation brightening**: When the cursor hovers over an interactive element (`.feature`, `.button`, `.contact-row`), all particles within a 200px radius of that element's center "activate": their opacity jumps to 0.6, their radius scales to 1.5×, and connection lines within this cluster thicken to 1px and brighten to 0.4 opacity. A radial gradient glow (`<radialGradient>`) is applied to the cluster's centroid. The activation animates in with a staggered spring (each particle springs at `stiffness: 200, damping: 14`, with a 10ms stagger based on distance from epicenter).
8. **Section-colored clusters**: Divide the page vertically into sections (hero, features, quote-band, contact). Particles that are currently floating within a section's vertical bounds gradually shift their fill color toward that section's accent (`hero → --petal-pink`, `features → --powder-mint`, `quote-band → --chalk-lavender`, `contact → --warm-cream`). The color transition uses HSL interpolation over 60 frames.
9. **Constellation "pulse" on scroll stop**: When scrolling decelerates below 0.5px/frame (near-stop after active scrolling), trigger a radial pulse wave originating from the viewport center. The wave travels outward at 8px/frame and, as it passes each particle, causes a brief brightness flash (opacity → 0.7 for 200ms) and a small outward velocity impulse (3px). This creates a satisfying "ripple" through the star field each time the user pauses.
10. **Performance & cleanup**: Use `will-change: transform` on the SVG container. Particles that drift more than 200px off-screen are teleported to a random position on the opposite edge (toroidal wrapping with randomized entry). If `devicePixelRatio > 2` or if frame time exceeds 18ms average, reduce particle count to 150 and connection distance to 70px. On `prefers-reduced-motion`, disable entirely.

**Integration point**: The constellation SVG is appended to `<body>` with `position: fixed; inset: 0; z-index: 1; pointer-events: none; mix-blend-mode: soft-light;`. Its update function `updateConstellation()` is called in the main `animationFrame()` loop after `updateMagnetic()`. Cursor position is read from the existing `state.mouseX / state.mouseY`.

---

## Prompt 5 — Physics-Based Storybook Page Peel & Curl Transitions

**What it does**: Replace the current canvas-based particle-morph page transition with a **physically-simulated page-curl/peel effect** that makes the entire viewport appear to be a page in a physical storybook being turned. When the user triggers a page navigation, the current "page" peels back from the corner with realistic paper physics — curl, shadow, backface content, and a "new page" sliding in underneath — like turning a page in a real children's book.

**Technical layers (minimum 10)**:

1. **WebGL page-curl shader**: Render the current page content to a full-viewport WebGL texture using `html2canvas` (or a pre-rendered screenshot via `OffscreenCanvas` and the `drawImage` API). Apply a custom vertex+fragment shader pair that deforms the texture as a cylindrical page curl. The curl is parameterized by: `curlRadius` (the radius of the paper cylinder, starts at ∞ = flat, decreases to 40px at peak curl), `curlAngle` (0° = flat, swept to 180° = fully turned), and `curlOrigin` (the bottom-right corner, [1.0, 1.0] in UV space).
2. **Cloth physics simulation**: The page surface is tessellated into a 40×60 grid of mass-spring vertices. Each vertex has position, velocity, and is connected to its 4 neighbors (structural springs) and 2 diagonal neighbors (shear springs) with spring stiffness 800 and damping 15. The curl is driven by animating a "fold line" that sweeps from the bottom-right corner toward the top-left, and all vertices on the "turned" side of the fold line are projected onto the curl cylinder surface. Vertices near the fold line experience maximum deformation.
3. **Paper thickness & backface rendering**: The shader renders the page as a thin slab with 2px "thickness". When the page curls past 90°, the backside becomes visible and shows a mirrored, slightly desaturated version of the current page content (simulating ink bleed-through on thin paper) overlaid with a subtle paper-fiber texture (a noise pattern at low contrast).
4. **Dynamic shadow projection**: As the curl progresses, compute a soft shadow beneath the curling page. The shadow is a Gaussian-blurred silhouette of the curled mesh projected onto a flat plane (the "next page" behind). Shadow offset and blur radius are proportional to the curl height (higher curl = more spread shadow). Shadow color is `rgba(42, 33, 24, 0.12–0.25)`.
5. **Ambient occlusion in the curl crease**: Along the fold line (where the paper bends most sharply), darken the page texture by applying a narrow Gaussian AO term: pixels within 8px of the fold line in UV space receive a `multiply` darkening of `0.85`, falling off to `1.0` outside 8px. This subtle crease shadow sells the 3D paper illusion.
6. **Page-turn animation curve**: The fold-line sweep follows a custom cubic-Bézier easing: fast start (paper "catches" air), slow-down at the middle (the satisfying drag of a real page turn), and fast snap at the end (the page settling). Total duration: 1.2s. The `curlRadius` follows a separate easing: starts at ∞, tightens to 40px at 50% progress, then relaxes back to 80px at the end as the page "lands".
7. **Particle confetti burst at release**: At the moment the page fully turns (progress > 0.95), emit 40–60 small paper-fragment particles from the curl crease. Each fragment is a tiny (4–8px) rotated rectangle rendered in the WebGL scene with a random color from the palette and a random angular velocity. Fragments are affected by a simplified gravity (0.3px/frame²) and air resistance (velocity *= 0.97/frame). They land and fade out over 600ms.
8. **Incoming page "slide-up" reveal**: Behind the curling page, the destination page content is pre-rendered to a second texture and displayed on a flat quad. As the curl progresses, this quad translates upward by `(1 - progress) * 30px` and fades in from opacity 0.7 to 1.0, creating a gentle "rise into view" feel — as if the next page of the storybook is floating up to meet the reader.
9. **Interactive drag-to-peel (pre-navigation)**: Before the user commits to a navigation, allow a "peek" interaction: if the user hovers near the bottom-right corner of the viewport (within 80px), a small corner of the page begins to curl up (curlAngle ≈ 15°, curlRadius ≈ 120px). Moving the mouse further toward the center increases the curl. If the mouse moves back, the curl springs back to flat (spring stiffness 300, damping 20). If the mouse passes a "commit threshold" (curlAngle > 45°) AND simultaneously the user clicks, the full page-turn animation triggers. This gives a playful "peeking at the next page" mechanic.
10. **Sound design hooks**: Emit custom events (`page-curl-start`, `page-curl-commit`, `page-curl-land`) at key moments in the animation so that an (optional) audio system can layer paper-rustling sounds. The events carry `progress` and `velocity` data for dynamic sound parameter mapping (faster turns = louder rustle). No audio implementation needed — just the event dispatch architecture.

**Integration point**: Replaces the existing `runParticleMorph()` function. The WebGL context reuses the canvas element already created by that function (`.particle-canvas`), but switches to a GLSL shader pipeline. The `html2canvas` capture happens synchronously after `body.classList.add('story-transition-active')` dims the shell. The peek interaction is initialized in `setupGenerateTrigger()` for the CTA button and in `setupFlipLinks()` for all `.html` navigation links.

---

> **Note**: Each prompt above is designed to be implemented **independently** — they do not depend on each other. However, they are architecturally compatible and can coexist if all five are implemented. Performance budgets assume a combined frame-time ceiling of 16ms on a mid-range GPU (e.g., GTX 1650 / M1 integrated).

---
---

# Advanced Animation Prompts — Volume 2

> **Context**: These 5 prompts describe animation systems that are **completely absent** from the current codebase. None of these overlap with the existing cursor, parallax, constellation, SVG morphing, ink simulation, text reveal, page transition, or breathing systems. Each introduces an entirely new visual dimension.

---

## Prompt 6 — Procedural Watercolor Section Bleeds

**What it does**: At every section boundary (the gap between hero → features, features → quote-band, quote-band → contact, and between subpages), render a **procedurally-generated watercolor stain** that grows, bleeds, and evolves as the user scrolls past it. Think of the colored water stains you see at the edges of old watercolor paintings — irregular, organic, translucent patches that look like pigment has bled through wet paper. Each boundary gets a unique stain that is generated at page load and never repeats.

**Technical layers (8)**:

1. **Boundary detection & canvas placement**: On init, find all section boundary positions (`.section-rule`, `.quote-band` top/bottom edges, section gaps). For each boundary, create an absolutely-positioned `<canvas>` element (width: 100vw, height: 280px) centered vertically on the boundary line. These canvases are layered behind content at `z-index: 0` with `pointer-events: none; opacity: 0.65; mix-blend-mode: multiply;`.

2. **Stain generation algorithm**: Each stain is generated once at init using a **random-walk flood fill** on a 2D bitmap. Start from 3–6 random seed points along the horizontal center line. From each seed, perform a biased random walk (probability of stepping: 60% horizontal, 40% vertical, with a slight downward gravity bias of 55/45). At each step, deposit pigment with intensity `0.15–0.4` in a 4–8px radius soft circle. The walk continues for 800–2000 steps (randomized per seed). The result is an irregular, organic blob shape.

3. **Color assignment**: Each stain picks 2 adjacent colors from the palette based on which sections it bridges (hero/features boundary → petal-pink + powder-mint, features/quote → powder-mint + chalk-lavender, etc.). The two colors are distributed spatially: the top half of the stain leans toward the upper section's color, the bottom half toward the lower section's color, with a noisy blend zone in the middle.

4. **Edge feathering**: After the stain bitmap is generated, apply a 2-pass box blur (radius 12px) to create soft edges. Then multiply the result by a vertical Gaussian falloff (sigma = 60px, centered on the boundary line) so the stain fades to transparent at its top and bottom extremes.

5. **Capillary tendrils**: From the outer edge of each stain blob, extend 8–15 thin "tendrils" — narrow streaks of color that reach outward like capillary action pulling pigment along paper fibers. Each tendril is a Bézier curve (3 control points with random jitter) drawn with lineWidth 1–3px and a linear opacity gradient from 0.3 → 0. Tendrils extend 40–120px beyond the main blob edge.

6. **Scroll-driven growth animation**: The stain starts at 30% of its final size (only the dense core is visible). As the user scrolls the boundary into the viewport center, the stain "grows" to 100% over 1.5 seconds. Growth is achieved by progressively revealing pre-computed stain layers (the walk is divided into 5 temporal layers, each drawn sequentially). This creates the illusion of ink actively bleeding into the paper as you watch.

7. **Pigment pooling**: At the lowest points of each stain (detected via a simple vertical-position scan), darken the color by 20% and increase opacity by 0.1 — simulating gravity causing pigment to pool at the bottom of wet areas. This sells the watercolor physics.

8. **Performance**: All stain bitmaps are generated once at init (async via `requestIdleCallback`, ~50ms per stain). After generation, the canvases are static except during the scroll-driven growth reveal. No per-frame redraws after growth completes. Total GPU memory: ~5 canvases × 280px × viewport-width × 4 bytes ≈ under 8MB.

**Integration point**: A new `setupSectionBleeds()` function called at init. The growth animation is triggered by IntersectionObserver (threshold: 0.3) — no tie-in to the main animation loop needed. Scroll position is read only for the growth timing.

---

## Prompt 7 — Narrative Golden Thread

**What it does**: Render a single, continuous **glowing thread** — like a golden silk strand — that visually weaves through the entire page from top to bottom, connecting all sections like the binding thread of a storybook. The thread curves around content blocks, dips behind sections, loops through illustrations, and pulses gently with a warm glow. It responds to scroll (the thread "pulls taught" as you approach a section) and cursor proximity (the thread bows toward the mouse like a magnetic string).

**Technical layers (9)**:

1. **Thread path definition**: Define the thread as a series of 20–40 anchor points placed manually at meaningful positions down the page: starting at the hero illustration's wand tip, curving right to the first feature card, dipping left through the quote-band, winding through the contact section, etc. Anchor positions are stored as `{ x: percentage, y: pixelOffset }` relative to their parent section, so they survive layout reflow. At init, resolve all anchors to absolute page coordinates and build a smooth Catmull-Rom spline through them.

2. **SVG path rendering**: The thread is rendered as a single SVG `<path>` element inside a full-page-height `<svg>` container (`position: absolute; top: 0; left: 0; width: 100%; height: <pageHeight>px; pointer-events: none; z-index: 2;`). The path `d` attribute is recomputed from the spline whenever the page layout changes (resize, content load). Stroke: `rgba(218, 185, 130, 0.55)` (warm gold), stroke-width: `1.5px`, stroke-linecap: `round`, fill: `none`.

3. **Glow effect**: Behind the main thread path, render a second identical `<path>` with stroke-width `6px`, stroke `rgba(245, 230, 192, 0.25)`, and a CSS `filter: blur(4px)`. This creates a soft warm halo around the thread. A third copy at stroke-width `14px`, stroke `rgba(245, 230, 192, 0.08)`, `filter: blur(10px)` adds a deeper ambient glow. Total: 3 layered SVG paths.

4. **Scroll-synchronized draw-on**: The thread uses `stroke-dasharray` and `stroke-dashoffset` to create a "drawing itself" effect synchronized with scroll. As the user scrolls from top to bottom, the thread progressively reveals, staying ~200px ahead of the current scroll position. The drawing speed accelerates slightly at section boundaries (the thread "races" to connect the next section) and decelerates within sections (it "settles").

5. **Cursor attraction**: On every animation frame, find the 3–5 thread anchor points closest to the cursor (within 300px). Displace those anchors toward the cursor by `attraction = 15 * (1 - distance/300)` pixels. The spline is recomputed from the displaced anchors, causing the thread to bow toward the mouse in a smooth, elastic curve. When the cursor moves away, the anchors spring back to their rest positions with `stiffness: 120, damping: 10`.

6. **Section knot markers**: At each section boundary (where the thread crosses from one section to the next), render a small decorative "knot" — a 12px SVG circle with an inner spiral path (3 turns, drawn with a dashed stroke). The knots glow brighter when their section is in view and dim when off-screen. Each knot has a slow rotation animation (6s per revolution, CSS `transform: rotate()`).

7. **Tension visualization**: Compute the "tension" of the thread between each pair of adjacent anchors as the ratio of straight-line distance to spline-arc distance. When tension is high (thread is pulled nearly straight by cursor or scroll), increase the stroke opacity to 0.8 and narrow the glow blur to 2px. When tension is low (thread is loose and curvy), decrease opacity to 0.4 and widen glow to 8px. This makes the thread feel physically real.

8. **Pulse animation**: A subtle brightness pulse travels along the thread at 120px/second (total loop time ≈ page-height/120 seconds). Implemented as an animated `stroke-dashoffset` on a fourth overlay `<path>` with a very short dash (`8px on, 500px off`) and a brighter stroke (`rgba(255, 235, 180, 0.5)`). The pulse appears as a small bright spot traveling along the golden thread like a firefly walking a tightrope.

9. **Performance**: The spline recomputation (20–40 points → Catmull-Rom → SVG path string) runs only when cursor attraction changes or on scroll (throttled to 30fps). The SVG DOM has only 4 `<path>` elements + 6–8 knot `<circle>`s — trivial GPU cost. The glow is CSS `filter: blur()` with `will-change: filter` only on the glow paths. On `prefers-reduced-motion`, the pulse and cursor attraction are disabled; only the static thread path with scroll-synced draw-on remains.

**Integration point**: `setupNarrativeThread()` is called at init after layout settles. The cursor-attraction update runs inside `animationFrame()` after `updateConstellation()`. The SVG container lives inside `.site-shell` so it scrolls with the page naturally.

---

## Prompt 8 — Kinetic Liquid Typography

**What it does**: All headings (`h1`, `h2`, `h3`) and the `.brand-mark` behave as if their letters are **floating on the surface of water**. When the cursor moves near a heading, the letters ripple outward from the cursor point like a stone dropped in a pond. When the user scrolls, letters experience a gentle directional wave. At rest, letters have a barely-perceptible idle sway — like reflections on still water. This is NOT a CSS animation trick — it's a per-letter physics simulation with wave propagation.

**Technical layers (8)**:

1. **Letter decomposition**: On init, find all target elements (`h1, h2, h3, .brand-mark`). For each, split the `textContent` into individual characters, wrapping each in a `<span class="liquid-char">` with `display: inline-block; transform-origin: center bottom;`. Preserve spaces as `&nbsp;` spans. Store a reference array: `[{ element, restX, restY, currentY, velocityY, phase }]` per character. Record each character's rest position via `getBoundingClientRect()`.

2. **Wave propagation model**: Each character is a point on a 1D wave simulation. Characters have: `currentY` (vertical displacement from rest), `velocityY` (vertical speed), and are coupled to their neighbors by spring forces. The wave equation per frame: `velocityY[i] += (leftY + rightY - 2 * currentY[i]) * springConstant` where `springConstant = 0.18`. Apply damping: `velocityY[i] *= 0.94`. Update: `currentY[i] += velocityY[i]`. This produces a physically-correct 1D wave that propagates left and right from a disturbance point.

3. **Cursor ripple injection**: When the cursor is within 200px of a heading's bounding box, find the character closest to the cursor's horizontal position. Apply an impulse: `velocityY[closestIndex] += impulseStrength` where `impulseStrength = -3.5 * (1 - distance / 200)` (negative = upward displacement, stronger when closer). The impulse naturally propagates outward through the spring chain, creating a ripple that travels both directions along the heading. Throttle impulse injection to every 80ms to prevent over-excitation.

4. **Scroll wave**: When scroll velocity exceeds 2px/frame, apply a traveling sine wave to all visible headings: `currentY[i] += sin(i * 0.4 + scrollProgress * 8) * scrollVelocity * 0.06`. The wave direction matches the scroll direction. This makes headings "undulate" as you scroll past them, like text painted on a flag in wind.

5. **Idle micro-sway**: Even at rest (no cursor, no scroll), each character has a unique `phase` value. Apply a barely-visible idle displacement: `idleY = sin(time * 0.001 + phase) * 0.6`. This ensures headings never feel dead-static — they breathe like a calm water surface.

6. **Transform application**: On each animation frame, for each visible heading's characters, apply: `element.style.transform = translate3d(0, ${currentY}px, 0) rotate(${currentY * 0.8}deg)`. The rotation adds a tilting effect — characters lean as they're displaced, like physical letters floating on water and rocking. Use `scale(1 + Math.abs(currentY) * 0.008)` as well to add a subtle size pulse at wave peaks.

7. **Color wave effect**: Characters at the peak of a wave (absolute displacement > 1.5px) temporarily shift color toward `--teal-wash` using `style.color` with an HSL interpolation: `mix(baseColor, tealWash, Math.min(Math.abs(currentY) / 4, 0.35))`. Characters at rest stay the default `--fg` color. This creates a traveling color shimmer along the heading that follows the wave.

8. **Performance**: Only simulate headings currently within the viewport (checked via a coarse `getBoundingClientRect().top` test, not IntersectionObserver — faster for a small element count). Skip simulation entirely when all character velocities are below 0.01px/frame (quiescent state). The character count per heading is small (5–30 chars), so even 10 visible headings = ~200 spring calculations/frame — trivially fast. Use `transform` (not `top`/`margin`) for zero-layout-cost updates. On `prefers-reduced-motion`, disable everything — headings remain static.

**Integration point**: `setupLiquidTypography()` is called at init after `setupTextReveal()` completes (so it wraps already-revealed text, not pre-reveal hidden text). The per-frame simulation runs inside `animationFrame()` as `updateLiquidText(scrollValue, now)`. Character elements are `.liquid-char` and are skipped by the existing text-reveal system (which targets the parent `h1/h2/h3`).

---

## Prompt 9 — Ambient Storybook Weather System

**What it does**: Overlay the entire page with a **time-of-day-aware ambient weather system** that creates atmospheric particles — falling flower petals during daytime, drifting fireflies at dusk/night, and gentle snowflake-like sparkles during late night. The system reads the user's local time and smoothly transitions between weather states. This creates an emotional connection: the storybook app feels different at bedtime than at breakfast, reinforcing its purpose as a nighttime comfort tool.

**Technical layers (9)**:

1. **Time-of-day detection & state machine**: On init, read `new Date().getHours()`. Define 4 weather states: `morning` (6am–12pm), `afternoon` (12pm–5pm), `evening` (5pm–9pm), `night` (9pm–6am). The current state determines which particle type is active. Recheck every 60 seconds. When transitioning between states, crossfade particles over 3 seconds (old particles fade out, new particles fade in).

2. **Particle pool architecture**: Pre-allocate a single `Float32Array` of 120 particles × 12 floats per particle: `[x, y, vx, vy, size, rotation, rotationSpeed, opacity, life, maxLife, type, seed]`. Particles are recycled — when a particle's `life > maxLife`, it respawns at the top of the viewport with new random properties. All particles are rendered onto a single `<canvas>` element (`position: fixed; inset: 0; z-index: 3; pointer-events: none; mix-blend-mode: screen;`) using 2D canvas.

3. **Petal particles (morning/afternoon)**: Rendered as small ellipses (6×10px) with a palette color fill (pink or mint, 50/50). Each petal: falls at 0.3–0.8 px/frame, drifts horizontally on a sine wave (`x += sin(life * 0.02 + seed) * 0.4`), rotates slowly (`rotation += rotationSpeed` where rotationSpeed = 0.5–2.0 deg/frame). Opacity: 0.15–0.35. The ellipse is drawn with `ctx.ellipse()` and a slight `ctx.rotate()` to create a tumbling leaf effect. Spawn rate: 2 per second.

4. **Firefly particles (evening)**: Rendered as tiny circles (3–5px) with a warm glow. Color: `rgba(245, 230, 192, opacity)`. Each firefly: drifts slowly on a 2D curl-noise path (reuse the existing `noise2D` function) at 0.1–0.3 px/frame. Key behavior: **bioluminescent pulse** — opacity oscillates on a sin wave with a randomized period (1.5–4 seconds) between 0.05 (nearly invisible) and 0.55 (bright flash). The flash has an asymmetric envelope: fast on (200ms), slow off (1.5s), mimicking real firefly patterns. Draw a soft radial gradient around each bright firefly (radius 12px, color fading to transparent) for the glow halo. Spawn rate: 3 per second, max 40 on screen.

5. **Sparkle particles (night)**: Rendered as 4-pointed star shapes (8–14px). Color: white at very low opacity (0.08–0.2). Each sparkle: drifts downward at 0.05–0.15 px/frame (very slow), has a gentle horizontal wobble. Key behavior: **twinkle** — opacity jumps from base to 3× base for 100ms then decays back over 800ms, triggered randomly with 5% chance per frame. The star shape is drawn as two overlapping diamonds via `ctx.beginPath()` with 4 points. Spawn rate: 1 per second, max 60 on screen.

6. **Wind system**: A global `windX` value drifts on a slow sine wave (period: 20 seconds, amplitude: 0.3 px/frame). All particles' `vx` is offset by `windX`. During `evening` state, wind amplitude increases to 0.5 (gentle evening breeze). This means all particles lean in the same direction and shift together — creating a cohesive atmospheric feel rather than random noise.

7. **Cursor shelter zone**: Within a 120px radius of the cursor, particles experience a gentle repulsive force: `vx += (particleX - cursorX) / distance * 0.3`, `vy += (particleY - cursorY) / distance * 0.2`. This pushes particles away from the cursor, creating a "sheltered clearing" around the mouse — as if the reader's presence gently parts the weather. Petals tumble away faster. Fireflies scatter. Sparkles drift aside.

8. **Scroll velocity interaction**: When scroll velocity exceeds 5px/frame, multiply all particles' `vy` by `1 + scrollVelocity * 0.02` — making petals fall faster and fireflies scatter upward during fast scrolls. When scrolling stops, particles gradually return to their natural drift. This ties the weather to the reading rhythm.

9. **Performance**: 120 particles with simple 2D canvas drawing (no textures, no WebGL). Each frame: clear canvas, loop 120 particles, draw simple shapes. Total draw calls: ~120 × 3 canvas ops ≈ 360 operations. At 60fps this is under 1ms on any device. Canvas resolution: actual viewport size (no downscaling needed — the shapes are so simple). On `prefers-reduced-motion`, disable entirely. On mobile (`is-touch`), reduce to 60 particles.

**Integration point**: `setupStoryWeather()` is called at init. The particle update function `updateWeatherParticles(now)` runs inside `animationFrame()` after `updateConstellation()`. Weather state is stored in `state.weatherMode`. The canvas is appended to `<body>` after the constellation SVG. CSS: `body.has-weather .grain-overlay { opacity: 0.03; }` (reduce grain when weather is active to avoid visual noise).

---

## Prompt 10 — Interactive Shadow Puppet Theater

**What it does**: Every content card (`.feature`, `.detail-card`, `.flow-step`) and floating SVG element (`.orb`, `.mountains`, `.hero-illustration`) casts a **dynamic shadow** onto the page surface that responds to the cursor position as if the cursor is a light source. Moving the mouse shifts where shadows fall, how long they stretch, and how soft they become — like holding a lantern near paper puppets. The effect transforms the flat page into a subtle **shadow puppet theater** where the "light" is the reader's cursor.

**Technical layers (8)**:

1. **Light source model**: The cursor position defines a point light source located at `(mouseX, mouseY, 150)` in a virtual 3D space (Z=150 means the light is "above" the page surface at Z=0). Each content element is treated as a flat card at Z=0 with a known bounding box. The shadow for each card is projected onto the Z=0 plane from the light source using perspective projection: `shadowOffsetX = (elementCenterX - lightX) * (elementZ / (lightZ - elementZ))` — simplified since elementZ = 0: `shadowOffsetX = -(lightX - elementCenterX) * shadowDepth / lightZ`.

2. **Per-element shadow computation**: For each visible interactive element (`.feature`, `.detail-card`, `.flow-step`, checked via viewport bounds), compute: `dx = elementCenterX - mouseX`, `dy = elementCenterY - mouseY`, `distance = hypot(dx, dy)`. Shadow offset: `offsetX = dx * 0.08`, `offsetY = dy * 0.08`. Shadow blur: `blur = clamp(distance * 0.025, 4, 28)`. Shadow opacity: `opacity = clamp(1 - distance / 800, 0.04, 0.14)`. Apply via `element.style.boxShadow = \`${offsetX}px ${offsetY}px ${blur}px rgba(42, 33, 24, ${opacity})\``.

3. **SVG element long shadows**: For floating SVG elements (`.orb`, `.mountains`, `.hero-illustration`), render elongated "long shadows" instead of box-shadows. Create a duplicate SVG `<use>` element (referencing the original via `xlink:href`) with `fill: rgba(42, 33, 24, 0.06)`, `filter: blur(6px)`, and a `transform` that scales the shadow in the direction away from the cursor: `transform: translate(${offsetX * 2}px, ${offsetY * 2}px) scale(${1 + distance * 0.0003})`. The shadow stretches longer when the "light" (cursor) is further away — physically correct behavior.

4. **Shadow color temperature**: Shadows near the cursor (distance < 200px) have a warm tint: `rgba(140, 100, 65, opacity)` (warm brown). Shadows far from the cursor (distance > 500px) are cooler: `rgba(42, 33, 24, opacity)` (neutral dark). Interpolate between warm and cool using HSL `mix()` based on distance. This simulates warm lamplight — close shadows are warm, distant shadows are cold.

5. **Scroll parallax for shadows**: As the user scrolls, add a global vertical offset to all shadows: `globalShadowY = scrollVelocity * 0.15`. This makes shadows "lag" slightly during scroll, as if the light source stays fixed while content moves past it. The effect is extremely subtle (< 3px) but adds to the tangible 3D feel.

6. **Feature card "lift" on hover**: When a `.feature` or `.detail-card` is hovered, its virtual Z-height increases from 0 to 8 (over 200ms, eased). This increases its shadow offset and blur proportionally — making the card appear to "lift off" the page toward the light. Combined with the existing hover scale animation, this creates a convincing card-float effect. The lift decays back to 0 on mouseleave with spring physics (stiffness 200, damping 16).

7. **Ground contact shadows**: Each content card also receives a tiny, tight "contact shadow" — a permanent `box-shadow: 0 1px 3px rgba(42,33,24,0.06)` that stays fixed regardless of cursor position. This anchors the card to the page when the dynamic shadow moves, preventing a "floating" artifact. Without the contact shadow, cards look detached when the cursor is far away.

8. **Performance**: Shadow updates run only on visible elements (viewport intersection check). The computation is trivial: 2 subtractions, 1 hypot, 3 clamps per element. DOM writes are throttled to 30fps via the existing `animationFrame()` loop. `box-shadow` on ~10–15 visible elements is well within browser composite budgets. SVG long shadows use a single `<use>` per SVG (not a clone of all paths) — minimal DOM overhead. When the cursor is idle (no movement for 2 seconds), freeze shadow positions and skip computation entirely. On `prefers-reduced-motion`, apply only the static contact shadows.

**Integration point**: `setupShadowTheater()` is called at init after all interactive elements are registered. The per-frame update `updateShadowTheater(mouseX, mouseY, scrollVelocity)` runs inside `animationFrame()` after `updateMagnetic()`. Shadow elements are tracked in a `shadowTargets[]` array separate from `morphTargets[]`. The CSS `transition` property on affected elements is extended to include `box-shadow 120ms ease` for smooth shadow movement.

---

> **Note**: Prompts 6–10 are designed to coexist with Prompts 1–5 and all existing animation systems. Combined frame budget for all 10 systems: ≈ 8–12ms on a mid-range GPU, leaving 4–8ms headroom for browser compositing at 60fps. Each prompt can be implemented independently in any order.

(function () {
  const doc = document;
  const win = window;
  const root = doc.documentElement;
  const body = doc.body;

  const isTouch = win.matchMedia("(hover: none), (pointer: coarse)").matches;
  const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const interactionTraceEnabled = (() => {
    try {
      return win.localStorage.getItem("tinytales-debug-timing") === "true";
    } catch (error) {
      return false;
    }
  })();

  body.classList.toggle("is-touch", isTouch);
  body.classList.toggle("reduced-motion", reducedMotion);

  const state = {
    viewportWidth: win.innerWidth,
    viewportHeight: win.innerHeight,
    mouseX: win.innerWidth / 2,
    mouseY: win.innerHeight / 2,
    cursorX: win.innerWidth / 2,
    cursorY: win.innerHeight / 2,
    cursorVisible: false,
    currentScroll: win.scrollY,
    targetScroll: win.scrollY,
    maxScroll: 0,
    ticking: false,
    currentTime: 0,
    performanceMode: "high",
    frameTimes: [],
    frameTimeTotal: 0,
    frameIndex: 0,
    depthFocusTarget: 0,
    lastWheelAt: 0,
    lastScrollInputAt: 0,
    constellation: null,
    weatherMode: "morning",
    geometryCache: new WeakMap(),
    layoutRefreshScheduled: false,
    interactionTraceEnabled,
    effectLastRunAt: Object.create(null),
  };

  const siteShell = doc.querySelector(".site-shell");
  const interactiveSelector = [
    "a[href]",
    "button",
    "input",
    "textarea",
    ".feature",
    ".contact-row",
    ".page-link-row",
    ".detail-card",
    ".flow-step",
  ].join(",");

  const interactiveElements = [];
  const magneticElements = [];
  const parallaxSections = [];
  const breathers = [];
  const revealGroups = [];
  const morphTargets = [];
  const morphSvgModels = [];
  const morphBuckets = new Map();
  const depthCards = [];
  const depthLayers = [];
  const depthMotes = [];
  const cachedElements = new Set();
  const scheduledFrameTasks = new WeakMap();

  function setInkModeBadge() { }

  function deferTask(task) {
    if (win.scheduler && typeof win.scheduler.postTask === "function") {
      return win.scheduler.postTask(task, { priority: "background" });
    }
    return win.setTimeout(task, 0);
  }

  function traceInteraction(label, task) {
    if (!state.interactionTraceEnabled) {
      return task();
    }

    console.time(label);
    try {
      return task();
    } finally {
      console.timeEnd(label);
    }
  }

  function rememberElement(element) {
    if (!(element instanceof Element)) {
      return;
    }
    cachedElements.add(element);
  }

  function measureElement(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const metrics = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      pageLeft: rect.left + win.scrollX,
      pageTop: rect.top + state.currentScroll,
    };
    metrics.pageRight = metrics.pageLeft + metrics.width;
    metrics.pageBottom = metrics.pageTop + metrics.height;
    state.geometryCache.set(element, metrics);
    return metrics;
  }

  function getElementMetrics(element, allowMeasure = true) {
    if (!(element instanceof Element)) {
      return null;
    }
    return state.geometryCache.get(element) || (allowMeasure ? measureElement(element) : null);
  }

  function getViewportMetrics(element, allowMeasure = true) {
    const metrics = getElementMetrics(element, allowMeasure);
    if (!metrics) {
      return null;
    }

    return {
      left: metrics.pageLeft - win.scrollX,
      top: metrics.pageTop - state.currentScroll,
      width: metrics.width,
      height: metrics.height,
      right: metrics.pageRight - win.scrollX,
      bottom: metrics.pageBottom - state.currentScroll,
      pageLeft: metrics.pageLeft,
      pageTop: metrics.pageTop,
      pageRight: metrics.pageRight,
      pageBottom: metrics.pageBottom,
    };
  }

  function refreshLayoutCache() {
    const queue = Array.from(cachedElements);
    const chunkSize = 24;

    function processChunk(startIndex) {
      const endIndex = Math.min(startIndex + chunkSize, queue.length);
      for (let index = startIndex; index < endIndex; index += 1) {
        measureElement(queue[index]);
      }

      if (endIndex < queue.length) {
        deferTask(() => processChunk(endIndex));
      } else {
        state.layoutRefreshScheduled = false;
        if (morphSvgModels.length) {
          rebuildMorphBuckets();
        }
        if (state.sectionBleeds && state.sectionBleeds.refreshPositions) {
          state.sectionBleeds.refreshPositions();
        }
        if (state.narrativeThread && state.narrativeThread.refreshLayout) {
          state.narrativeThread.refreshLayout();
        }
      }
    }

    if (!queue.length) {
      state.layoutRefreshScheduled = false;
      return;
    }

    processChunk(0);
  }

  function scheduleLayoutRefresh() {
    if (state.layoutRefreshScheduled) {
      return;
    }
    state.layoutRefreshScheduled = true;
    deferTask(refreshLayoutCache);
  }

  function debounce(task, wait) {
    let timeoutId = 0;
    return (...args) => {
      win.clearTimeout(timeoutId);
      timeoutId = win.setTimeout(() => {
        task(...args);
      }, wait);
    };
  }

  function throttleInterval(task, interval) {
    let lastRun = 0;
    return (...args) => {
      const now = performance.now();
      if (now - lastRun < interval) {
        return;
      }
      lastRun = now;
      task(...args);
    };
  }

  function scheduleFrameTask(key, task) {
    if (scheduledFrameTasks.has(key)) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      scheduledFrameTasks.delete(key);
      task();
    });
    scheduledFrameTasks.set(key, frameId);
  }

  function smoothstep(edge0, edge1, value) {
    const t = clamp((value - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function mix(a, b, amount) {
    return a + (b - a) * amount;
  }

  function hashString(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createSeededRandom(seed) {
    let stateValue = seed >>> 0;
    return () => {
      stateValue += 0x6D2B79F5;
      let next = Math.imul(stateValue ^ (stateValue >>> 15), 1 | stateValue);
      next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function scheduleIdleWork(task) {
    if (typeof win.requestIdleCallback === "function") {
      return win.requestIdleCallback(task, { timeout: 120 });
    }
    return win.setTimeout(() => task({ didTimeout: true, timeRemaining: () => 0 }), 24);
  }

  function cancelIdleWork(handle) {
    if (!handle) {
      return;
    }
    if (typeof win.cancelIdleCallback === "function") {
      win.cancelIdleCallback(handle);
      return;
    }
    win.clearTimeout(handle);
  }

  function noise2D(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const fade = (t) => t * t * (3 - 2 * t);
    const sample = (sx, sy) => {
      const n = Math.sin(sx * 127.1 + sy * 311.7) * 43758.5453123;
      return n - Math.floor(n);
    };
    const a = sample(ix, iy);
    const b = sample(ix + 1, iy);
    const c = sample(ix, iy + 1);
    const d = sample(ix + 1, iy + 1);
    const ux = fade(fx);
    const uy = fade(fy);
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    let h = 0;
    let s = 0;
    const l = (max + min) * 0.5;
    const d = max - min;

    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rn:
          h = (gn - bn) / d + (gn < bn ? 6 : 0);
          break;
        case gn:
          h = (bn - rn) / d + 2;
          break;
        default:
          h = (rn - gn) / d + 4;
          break;
      }
      h /= 6;
    }

    return [h * 360, s, l];
  }

  function hslToRgb(h, s, l) {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
      const gray = Math.round(l * 255);
      return [gray, gray, gray];
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hueToRgb = (t) => {
      let tt = t;
      if (tt < 0) {
        tt += 1;
      }
      if (tt > 1) {
        tt -= 1;
      }
      if (tt < 1 / 6) {
        return p + (q - p) * 6 * tt;
      }
      if (tt < 1 / 2) {
        return q;
      }
      if (tt < 2 / 3) {
        return p + (q - p) * (2 / 3 - tt) * 6;
      }
      return p;
    };

    return [
      Math.round(hueToRgb(hue + 1 / 3) * 255),
      Math.round(hueToRgb(hue) * 255),
      Math.round(hueToRgb(hue - 1 / 3) * 255),
    ];
  }

  function mixHue(current, target, amount) {
    let delta = ((target - current + 540) % 360) - 180;
    return current + delta * amount;
  }

  function circleToPathData(circle) {
    const cx = Number(circle.getAttribute("cx") || 0);
    const cy = Number(circle.getAttribute("cy") || 0);
    const radius = Number(circle.getAttribute("r") || 0);
    const k = 0.552284749831 * radius;
    return [
      `M ${cx + radius} ${cy}`,
      `C ${cx + radius} ${cy + k} ${cx + k} ${cy + radius} ${cx} ${cy + radius}`,
      `C ${cx - k} ${cy + radius} ${cx - radius} ${cy + k} ${cx - radius} ${cy}`,
      `C ${cx - radius} ${cy - k} ${cx - k} ${cy - radius} ${cx} ${cy - radius}`,
      `C ${cx + k} ${cy - radius} ${cx + radius} ${cy - k} ${cx + radius} ${cy}`,
      "Z",
    ].join(" ");
  }

  function ensureMorphablePath(node) {
    if (node instanceof SVGPathElement) {
      return node;
    }

    if (!(node instanceof SVGCircleElement)) {
      return null;
    }

    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    Array.from(node.attributes).forEach((attribute) => {
      if (attribute.name !== "cx" && attribute.name !== "cy" && attribute.name !== "r") {
        path.setAttribute(attribute.name, attribute.value);
      }
    });
    path.setAttribute("data-origin-circle", "true");
    path.setAttribute("d", circleToPathData(node));
    node.replaceWith(path);
    return path;
  }

  function samplePathPoints(path, pointCount, closed) {
    const totalLength = Math.max(path.getTotalLength(), 1);
    const points = new Float32Array(pointCount * 2);
    const divisor = closed ? pointCount : Math.max(pointCount - 1, 1);
    for (let index = 0; index < pointCount; index += 1) {
      const distance = closed ? (index / divisor) * totalLength : (index / divisor) * totalLength;
      const point = path.getPointAtLength(Math.min(distance, totalLength));
      points[index * 2] = point.x;
      points[index * 2 + 1] = point.y;
    }
    return { points, totalLength };
  }

  function buildVariantPoints(restPoints, pointCount, mode, strength) {
    const variant = new Float32Array(restPoints.length);
    for (let index = 0; index < pointCount; index += 1) {
      const prevIndex = Math.max(0, index - 1);
      const nextIndex = Math.min(pointCount - 1, index + 1);
      const px = restPoints[prevIndex * 2];
      const py = restPoints[prevIndex * 2 + 1];
      const cx = restPoints[index * 2];
      const cy = restPoints[index * 2 + 1];
      const nx = restPoints[nextIndex * 2];
      const ny = restPoints[nextIndex * 2 + 1];
      const tangentX = nx - px;
      const tangentY = ny - py;
      const tangentLength = Math.hypot(tangentX, tangentY) || 1;
      const normalX = -tangentY / tangentLength;
      const normalY = tangentX / tangentLength;
      let x = cx;
      let y = cy;

      if (mode === "stretch") {
        const pulse = 0.65 + Math.sin(index * 0.45) * 0.35;
        x += normalX * strength * pulse;
        y += normalY * strength * pulse;
      } else if (mode === "melt") {
        const wave = Math.sin(index * 0.32) * strength * 0.7;
        x += wave;
        y += strength * (0.8 + Math.sin(index * 0.18) * 0.35);
      }

      variant[index * 2] = x;
      variant[index * 2 + 1] = y;
    }
    return variant;
  }

  function buildMorphPath(points, closed) {
    const count = points.length / 2;
    if (count < 2) {
      return "";
    }

    const commands = [`M ${points[0].toFixed(2)} ${points[1].toFixed(2)}`];

    for (let index = 0; index < count - (closed ? 0 : 1); index += 1) {
      const prevIndex = closed ? (index - 1 + count) % count : Math.max(index - 1, 0);
      const currentIndex = index;
      const nextIndex = (index + 1) % count;
      const afterIndex = closed ? (index + 2) % count : Math.min(index + 2, count - 1);

      if (!closed && index === count - 1) {
        break;
      }

      const x0 = points[prevIndex * 2];
      const y0 = points[prevIndex * 2 + 1];
      const x1 = points[currentIndex * 2];
      const y1 = points[currentIndex * 2 + 1];
      const x2 = points[nextIndex * 2];
      const y2 = points[nextIndex * 2 + 1];
      const x3 = points[afterIndex * 2];
      const y3 = points[afterIndex * 2 + 1];
      const cp1x = x1 + (x2 - x0) / 6;
      const cp1y = y1 + (y2 - y0) / 6;
      const cp2x = x2 - (x3 - x1) / 6;
      const cp2y = y2 - (y3 - y1) / 6;

      commands.push(
        `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`
      );
    }

    if (closed) {
      commands.push("Z");
    }

    return commands.join(" ");
  }

  function applySvgMorphTransform(model) {
    const transform = `skewY(${model.skewCurrent.toFixed(3)}deg) scale(${(1 + model.hoverCurrent * 0.03).toFixed(4)})`;
    model.svg.dataset.morphTransform = transform;

    if (!model.parallaxControlled) {
      model.svg.style.transform = transform;
    }
  }

  function rebuildMorphBuckets() {
    morphBuckets.clear();
    const bucketSize = Math.max(360, state.viewportHeight * 0.75);
    morphSvgModels.forEach((model) => {
      const metrics = getElementMetrics(model.svg, false);
      if (!metrics) {
        return;
      }
      const pageTop = metrics.pageTop;
      const bucket = Math.floor(pageTop / bucketSize);
      if (!morphBuckets.has(bucket)) {
        morphBuckets.set(bucket, []);
      }
      morphBuckets.get(bucket).push(model);
    });
    state.morphBucketSize = bucketSize;
  }

  function setupSVGMorphing() {
    if (reducedMotion) {
      return;
    }

    const svgSelector = ".hero-illustration, .feature svg, .orb, .mountains, .mini-illustration svg";
    doc.querySelectorAll(svgSelector).forEach((svg, svgIndex) => {
      if (!(svg instanceof SVGSVGElement)) {
        return;
      }

      const model = {
        svg,
        id: svgIndex,
        skewCurrent: 0,
        skewTarget: 0,
        skewVelocity: 0,
        hoverCurrent: 0,
        hoverTarget: 0,
        hoverVelocity: 0,
        parallaxControlled: svg.classList.contains("orb") || svg.classList.contains("mountains") || svg.classList.contains("hero-illustration"),
      };

      const feature = svg.closest(".feature");
      if (feature instanceof HTMLElement) {
        rememberElement(feature);
        const activateHover = debounce(() => {
          model.hoverTarget = 1;
        }, 16);
        const deactivateHover = debounce(() => {
          model.hoverTarget = 0;
        }, 16);
        feature.addEventListener("mouseenter", activateHover);
        feature.addEventListener("mouseleave", deactivateHover);
      }

      morphSvgModels.push(model);
      rememberElement(svg);

      svg.querySelectorAll("path, circle").forEach((node, targetIndex) => {
        const path = ensureMorphablePath(node);
        if (!(path instanceof SVGPathElement)) {
          return;
        }

        let totalLength = 0;
        try {
          totalLength = path.getTotalLength();
        } catch (error) {
          return;
        }

        if (!Number.isFinite(totalLength) || totalLength <= 0.5) {
          return;
        }

        const pointCount = Math.max(28, Math.min(64, Math.round(totalLength / 8)));
        const closed = /z\s*$/i.test((path.getAttribute("d") || "").trim()) || path.classList.contains("bubble") || path.classList.contains("shape-fill");
        const sample = samplePathPoints(path, pointCount, closed);
        const bbox = path.getBBox();
        const baseStrength = clamp(Math.max(bbox.width, bbox.height) * 0.08, 8, 20);
        const rest = sample.points;
        const stretch = buildVariantPoints(rest, pointCount, "stretch", baseStrength);
        const melt = buildVariantPoints(rest, pointCount, "melt", baseStrength * 0.9);
        const work = new Float32Array(rest.length);

        path.style.transformBox = "fill-box";
        path.style.transformOrigin = "center";
        path.style.willChange = "d, stroke-dashoffset, transform";
        path.style.strokeDasharray = `${sample.totalLength.toFixed(2)}`;
        path.style.strokeDashoffset = `${sample.totalLength.toFixed(2)}`;

        morphTargets.push({
          model,
          path,
          pointCount,
          closed,
          rest,
          stretch,
          melt,
          work,
          strokeLength: sample.totalLength,
          seed: svgIndex * 37 + targetIndex * 11 + 1,
          heroMultiplier: path.classList.contains("hair-fill")
            ? 1.5
            : path.classList.contains("dress-fill")
              ? 1.2
              : path.classList.contains("skin-fill")
                ? 0.8
                : 1,
          isWand: path.classList.contains("bubble-wand"),
        });
      });
    });

    scheduleLayoutRefresh();
  }

  function updateSVGMorphing(scrollValue, now) {
    if (reducedMotion || !morphTargets.length) {
      return;
    }

    const performanceMode = state.performanceMode || "high";
    if (performanceMode === "low" && state.frameIndex % 2 === 1) {
      morphSvgModels.forEach((model) => {
        model.hoverVelocity += (model.hoverTarget - model.hoverCurrent) * 0.16;
        model.hoverVelocity *= 0.78;
        model.hoverCurrent += model.hoverVelocity;
        const skewForce = (model.skewTarget - model.skewCurrent) * 0.12;
        model.skewVelocity += skewForce;
        model.skewVelocity *= 0.76;
        model.skewCurrent += model.skewVelocity;
        model.skewTarget *= 0.82;
        applySvgMorphTransform(model);
      });
      return;
    }

    const velocity = clamp(state.targetScroll - state.currentScroll, -42, 42);
    const direction = Math.sign(velocity);
    if (direction && direction !== state.lastMorphDirection) {
      morphSvgModels.forEach((model) => {
        model.skewTarget = direction * 2;
      });
      state.lastMorphDirection = direction;
    }

    const bucketSize = state.morphBucketSize || Math.max(360, state.viewportHeight * 0.75);
    const firstBucket = Math.floor((scrollValue - state.viewportHeight * 0.5) / bucketSize);
    const lastBucket = Math.floor((scrollValue + state.viewportHeight * 1.5) / bucketSize);
    const activeModels = new Set();

    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      const entries = morphBuckets.get(bucket);
      if (entries) {
        entries.forEach((model) => activeModels.add(model));
      }
    }

    morphSvgModels.forEach((model) => {
      model.hoverVelocity += (model.hoverTarget - model.hoverCurrent) * 0.16;
      model.hoverVelocity *= 0.78;
      model.hoverCurrent += model.hoverVelocity;

      const skewForce = (model.skewTarget - model.skewCurrent) * 0.12;
      model.skewVelocity += skewForce;
      model.skewVelocity *= 0.76;
      model.skewCurrent += model.skewVelocity;
      model.skewTarget *= 0.82;
      applySvgMorphTransform(model);
    });

    const morphStride = performanceMode === "low" ? 2 : 1;
    const jitterAmount = performanceMode === "high" ? 1 : 0.45;

    morphTargets.forEach((target, targetIndex) => {
      if (!activeModels.has(target.model)) {
        return;
      }

      if (morphStride > 1 && targetIndex % morphStride === 1) {
        return;
      }

      const rect = getViewportMetrics(target.model.svg, false);
      if (!rect) {
        return;
      }
      if (rect.bottom < -120 || rect.top > state.viewportHeight + 120) {
        return;
      }

      const enter = smoothstep(state.viewportHeight * 0.9, state.viewportHeight * 0.35, rect.top);
      const exit = smoothstep(state.viewportHeight * 0.35, -state.viewportHeight * 0.3, rect.top);
      const blendToStretch = rect.top > state.viewportHeight * 0.35 ? enter : 1;
      const blendToMelt = rect.top > state.viewportHeight * 0.35 ? 0 : exit;
      const drawProgress = Math.max(enter, exit);
      const hoverPop = target.model.hoverCurrent * 12;
      const velocityWarp = velocity * 0.4 * target.heroMultiplier;

      for (let index = 0; index < target.pointCount; index += 1) {
        const restX = target.rest[index * 2];
        const restY = target.rest[index * 2 + 1];
        const stretchX = target.stretch[index * 2];
        const stretchY = target.stretch[index * 2 + 1];
        const meltX = target.melt[index * 2];
        const meltY = target.melt[index * 2 + 1];
        let x = mix(restX, stretchX, blendToStretch);
        let y = mix(restY, stretchY, blendToStretch);
        x = mix(x, meltX, blendToMelt);
        y = mix(y, meltY, blendToMelt);

        const prevIndex = Math.max(0, index - 1);
        const nextIndex = Math.min(target.pointCount - 1, index + 1);
        const tangentX = target.rest[nextIndex * 2] - target.rest[prevIndex * 2];
        const tangentY = target.rest[nextIndex * 2 + 1] - target.rest[prevIndex * 2 + 1];
        const tangentLength = Math.hypot(tangentX, tangentY) || 1;
        const normalX = -tangentY / tangentLength;
        const normalY = tangentX / tangentLength;
        const jitter =
          (noise2D(index * 0.11 + now * 0.00045, target.seed * 0.17) - 0.5) * (1.4 + (target.seed % 3)) * jitterAmount;
        const warp = Math.sin(index * 0.3 + now * 0.012) * velocityWarp;

        x += normalX * hoverPop + normalX * jitter + warp;
        y += normalY * hoverPop + normalY * jitter * 0.9;

        target.work[index * 2] = x;
        target.work[index * 2 + 1] = y;
      }

      target.path.setAttribute("d", buildMorphPath(target.work, target.closed));
      target.path.style.strokeDashoffset = `${((1 - drawProgress) * target.strokeLength).toFixed(2)}`;

      if (target.isWand) {
        const angle = ((state.mouseX / Math.max(state.viewportWidth, 1)) * 2 - 1) * 15;
        target.path.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      }
    });
  }

  function setupConstellation() {
    if (reducedMotion || state.constellation) {
      return;
    }

    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("constellation-field");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("viewBox", `0 0 ${state.viewportWidth} ${state.viewportHeight}`);

    const defs = doc.createElementNS("http://www.w3.org/2000/svg", "defs");
    const gradient = doc.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
    gradient.setAttribute("id", "constellation-glow");
    gradient.innerHTML =
      '<stop offset="0%" stop-color="rgba(184,228,220,0.35)"></stop><stop offset="100%" stop-color="rgba(184,228,220,0)"></stop>';
    defs.appendChild(gradient);
    svg.appendChild(defs);

    const glow = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
    glow.setAttribute("fill", "url(#constellation-glow)");
    glow.setAttribute("opacity", "0");
    svg.appendChild(glow);

    const lineLayer = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    const cursorLineLayer = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    const particleLayer = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(lineLayer);
    svg.appendChild(cursorLineLayer);
    svg.appendChild(particleLayer);
    body.appendChild(svg);

    const particleLimit = 250;
    const particleStride = 10;
    const particles = new Float32Array(particleLimit * particleStride);
    const particleColors = new Float32Array(particleLimit * 3);
    const circles = [];
    const lines = [];
    const cursorLines = [];
    const sectionDefs = [
      { element: doc.querySelector(".hero, .subpage-hero"), color: rgbToHsl(242, 196, 206) },
      { element: doc.querySelector(".features, .detail-section"), color: rgbToHsl(184, 228, 220) },
      { element: doc.querySelector(".quote-band"), color: rgbToHsl(217, 200, 232) },
      { element: doc.querySelector(".contact"), color: rgbToHsl(245, 230, 192) },
    ];
    const basePalette = [
      rgbToHsl(242, 196, 206),
      rgbToHsl(184, 228, 220),
      rgbToHsl(217, 200, 232),
      rgbToHsl(245, 230, 192),
      rgbToHsl(168, 216, 216),
    ];

    for (let index = 0; index < particleLimit; index += 1) {
      const offset = index * particleStride;
      const color = basePalette[index % basePalette.length];
      particles[offset] = Math.random() * state.viewportWidth;
      particles[offset + 1] = Math.random() * state.viewportHeight;
      particles[offset + 2] = 0;
      particles[offset + 3] = 0;
      particles[offset + 4] = 1.5 + Math.random() * 1.5;
      particles[offset + 5] = particles[offset + 4];
      particles[offset + 6] = 0.12 + Math.random() * 0.23;
      particles[offset + 7] = color[0];
      particles[offset + 8] = Math.random() * 100;
      particles[offset + 9] = Math.random() * 100;

      const circle = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", particles[offset + 4].toFixed(2));
      particleLayer.appendChild(circle);
      circles.push(circle);
    }

    for (let index = 0; index < 400; index += 1) {
      const line = doc.createElementNS("http://www.w3.org/2000/svg", "line");
      line.style.display = "none";
      lineLayer.appendChild(line);
      lines.push(line);
    }

    for (let index = 0; index < 15; index += 1) {
      const line = doc.createElementNS("http://www.w3.org/2000/svg", "line");
      line.style.display = "none";
      line.setAttribute("stroke-dasharray", "4 8");
      cursorLineLayer.appendChild(line);
      cursorLines.push(line);
    }

    const hoverables = Array.from(doc.querySelectorAll(".feature, .button, .contact-row")).filter(
      (element) => element instanceof HTMLElement
    );
    const hoverState = { element: null, x: 0, y: 0, radius: 200 };

    hoverables.forEach((element) => {
      rememberElement(element);
      element.addEventListener("mouseenter", () => {
        const rect = getViewportMetrics(element);
        if (!rect) {
          return;
        }
        hoverState.element = element;
        hoverState.x = rect.left + rect.width * 0.5;
        hoverState.y = rect.top + rect.height * 0.5;
      });
      element.addEventListener("mouseleave", () => {
        if (hoverState.element === element) {
          hoverState.element = null;
        }
      });
    });

    state.constellation = {
      svg,
      glow,
      particles,
      particleColors,
      circles,
      lines,
      cursorLines,
      sectionDefs,
      hoverState,
      grid: new Map(),
      scrollRush: 0,
      timeOffset: 0,
      dashOffset: 0,
      pulse: { active: false, radius: 0, strength: 0, lastTriggerAt: 0 },
      lastActiveScrollVelocity: 0,
      activeCount: Math.min(particleLimit, win.devicePixelRatio > 2 ? 150 : 250),
      connectionDistance: win.devicePixelRatio > 2 ? 70 : 100,
      particleStride,
      particleLimit,
    };

    svg.setAttribute("viewBox", `0 0 ${state.viewportWidth} ${state.viewportHeight}`);
  }

  function updateConstellation(now) {
    const constellation = state.constellation;
    if (!constellation || reducedMotion) {
      return;
    }

    const performanceMode = state.performanceMode || "high";
    const activeCount = performanceMode === "low" ? 150 : performanceMode === "medium" ? 190 : constellation.activeCount;
    const connectionDistance = performanceMode === "low" ? 70 : performanceMode === "medium" ? 85 : constellation.connectionDistance;
    const cursorDistance = performanceMode === "low" ? 120 : 150;
    const particles = constellation.particles;
    const colors = constellation.particleColors;
    const circles = constellation.circles;
    const lines = constellation.lines;
    const cursorLines = constellation.cursorLines;
    const stride = constellation.particleStride;
    const grid = constellation.grid;
    grid.clear();
    constellation.timeOffset += 0.0003;
    constellation.dashOffset += 0.5;

    const scrollVelocity = state.targetScroll - state.currentScroll;
    constellation.scrollRush += scrollVelocity * 0.08;
    constellation.scrollRush *= 0.92;

    if (
      Math.abs(scrollVelocity) > 0.5 &&
      Math.abs(scrollVelocity) < 1 &&
      Math.abs(constellation.lastActiveScrollVelocity) >= 1 &&
      now - constellation.pulse.lastTriggerAt > 700
    ) {
      constellation.pulse.active = true;
      constellation.pulse.radius = 0;
      constellation.pulse.strength = 1;
      constellation.pulse.lastTriggerAt = now;
    }
    constellation.lastActiveScrollVelocity = scrollVelocity;

    if (constellation.hoverState.element instanceof HTMLElement) {
      const rect = getViewportMetrics(constellation.hoverState.element, false);
      if (rect) {
        constellation.hoverState.x = rect.left + rect.width * 0.5;
        constellation.hoverState.y = rect.top + rect.height * 0.5;
      }
    }

    const sectionBounds = constellation.sectionDefs
      .filter((section) => section.element instanceof HTMLElement)
      .map((section) => {
        const rect = getViewportMetrics(section.element, false);
        if (!rect) {
          return null;
        }
        return {
          top: rect.pageTop,
          bottom: rect.pageBottom,
          color: section.color,
        };
      })
      .filter(Boolean);

    for (let index = 0; index < constellation.particleLimit; index += 1) {
      const circle = circles[index];
      if (index >= activeCount) {
        circle.style.display = "none";
        continue;
      }

      const offset = index * stride;
      let x = particles[offset];
      let y = particles[offset + 1];
      let vx = particles[offset + 2];
      let vy = particles[offset + 3];
      const baseRadius = particles[offset + 4];
      let currentRadius = particles[offset + 5];
      let opacity = particles[offset + 6];
      let hue = particles[offset + 7];
      const noiseX = particles[offset + 8];
      const noiseY = particles[offset + 9];

      const nx = (x + now * 0.0003 + noiseX * 40) * 0.001;
      const ny = (y + now * 0.0003 + noiseY * 40) * 0.001;
      const eps = 0.001;
      const dx = noise2D(nx + eps, ny + constellation.timeOffset) - noise2D(nx - eps, ny + constellation.timeOffset);
      const dy = noise2D(nx, ny + eps + constellation.timeOffset) - noise2D(nx, ny - eps + constellation.timeOffset);
      vx += dy * 18;
      vy += -dx * 18 + constellation.scrollRush * 0.05;

      const cursorDx = state.mouseX - x;
      const cursorDy = state.mouseY - y;
      const cursorDist = Math.hypot(cursorDx, cursorDy) || 1;
      if (cursorDist < 180) {
        if (cursorDist < 60) {
          const pull = 1400 / (cursorDist * cursorDist + 1200);
          vx += (cursorDx / cursorDist) * pull + (-cursorDy / cursorDist) * 0.08;
          vy += (cursorDy / cursorDist) * pull + (cursorDx / cursorDist) * 0.08;
        } else {
          const repel = ((180 - cursorDist) / 180) * 0.16;
          vx -= (cursorDx / cursorDist) * repel * cursorDist * 0.08;
          vy -= (cursorDy / cursorDist) * repel * cursorDist * 0.08;
        }
      }

      let hoverBoost = 0;
      if (constellation.hoverState.element instanceof HTMLElement) {
        const hoverDx = x - constellation.hoverState.x;
        const hoverDy = y - constellation.hoverState.y;
        const hoverDist = Math.hypot(hoverDx, hoverDy);
        if (hoverDist < constellation.hoverState.radius) {
          hoverBoost = 1 - hoverDist / constellation.hoverState.radius;
          opacity = lerp(opacity, 0.6, 0.22);
          currentRadius = lerp(currentRadius, baseRadius * 1.5, 0.26);
        }
      }

      const pageY = y + state.currentScroll;
      let targetHue = hue;
      sectionBounds.forEach((section) => {
        if (pageY >= section.top && pageY <= section.bottom) {
          targetHue = section.color[0];
        }
      });
      hue = mixHue(hue, targetHue, 1 / 60);

      if (constellation.pulse.active) {
        const pulseDx = x - state.viewportWidth * 0.5;
        const pulseDy = y - state.viewportHeight * 0.5;
        const pulseDistance = Math.hypot(pulseDx, pulseDy);
        if (Math.abs(pulseDistance - constellation.pulse.radius) < 8) {
          opacity = 0.7;
          const impulse = 3 / Math.max(pulseDistance, 1);
          vx += pulseDx * impulse * 0.02;
          vy += pulseDy * impulse * 0.02;
        }
      }

      vx *= 0.94;
      vy *= 0.94;
      x += vx;
      y += vy;

      if (x < -200) {
        x = state.viewportWidth + Math.random() * 40;
      } else if (x > state.viewportWidth + 200) {
        x = -Math.random() * 40;
      }
      if (y < -200) {
        y = state.viewportHeight + Math.random() * 40;
      } else if (y > state.viewportHeight + 200) {
        y = -Math.random() * 40;
      }

      opacity = lerp(opacity, 0.12 + (index % 5) * 0.04, hoverBoost > 0 ? 0.08 : 0.04);
      currentRadius = lerp(currentRadius, baseRadius, 0.1);

      particles[offset] = x;
      particles[offset + 1] = y;
      particles[offset + 2] = vx;
      particles[offset + 3] = vy;
      particles[offset + 5] = currentRadius;
      particles[offset + 6] = opacity;
      particles[offset + 7] = hue;

      const rgb = hslToRgb(hue, 0.45, 0.78);
      colors[index * 3] = rgb[0];
      colors[index * 3 + 1] = rgb[1];
      colors[index * 3 + 2] = rgb[2];

      const cellX = Math.floor(x / 120);
      const cellY = Math.floor(y / 120);
      const key = `${cellX}:${cellY}`;
      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key).push(index);

      circle.style.display = "";
      circle.setAttribute("cx", x.toFixed(2));
      circle.setAttribute("cy", y.toFixed(2));
      circle.setAttribute("r", currentRadius.toFixed(2));
      circle.setAttribute("fill", `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity.toFixed(3)})`);
    }

    if (constellation.pulse.active) {
      constellation.pulse.radius += 8;
      if (constellation.pulse.radius > Math.hypot(state.viewportWidth, state.viewportHeight)) {
        constellation.pulse.active = false;
      }
    }

    let lineCount = 0;
    const neighborOffsets = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ];

    for (const [key, bucket] of grid.entries()) {
      const [cellX, cellY] = key.split(":").map(Number);
      for (let offsetIndex = 0; offsetIndex < neighborOffsets.length; offsetIndex += 1) {
        const offset = neighborOffsets[offsetIndex];
        const neighborKey = `${cellX + offset[0]}:${cellY + offset[1]}`;
        const neighbor = grid.get(neighborKey);
        if (!neighbor) {
          continue;
        }

        for (let i = 0; i < bucket.length; i += 1) {
          const a = bucket[i];
          const startJ = neighbor === bucket ? i + 1 : 0;
          for (let j = startJ; j < neighbor.length; j += 1) {
            if (lineCount >= lines.length) {
              break;
            }
            const b = neighbor[j];
            const ax = particles[a * stride];
            const ay = particles[a * stride + 1];
            const bx = particles[b * stride];
            const by = particles[b * stride + 1];
            const dx = bx - ax;
            const dy = by - ay;
            const distance = Math.hypot(dx, dy);
            if (distance > connectionDistance) {
              continue;
            }

            const aHover = constellation.hoverState.element instanceof HTMLElement
              ? Math.hypot(ax - constellation.hoverState.x, ay - constellation.hoverState.y) < 200
              : false;
            const bHover = constellation.hoverState.element instanceof HTMLElement
              ? Math.hypot(bx - constellation.hoverState.x, by - constellation.hoverState.y) < 200
              : false;
            const hoverLine = aHover && bHover;
            const line = lines[lineCount];
            const blendR = Math.round((colors[a * 3] + colors[b * 3]) * 0.5);
            const blendG = Math.round((colors[a * 3 + 1] + colors[b * 3 + 1]) * 0.5);
            const blendB = Math.round((colors[a * 3 + 2] + colors[b * 3 + 2]) * 0.5);
            const opacity = hoverLine ? 0.4 : (1 - distance / connectionDistance) * 0.18;
            line.style.display = "";
            line.setAttribute("x1", ax.toFixed(2));
            line.setAttribute("y1", ay.toFixed(2));
            line.setAttribute("x2", bx.toFixed(2));
            line.setAttribute("y2", by.toFixed(2));
            line.setAttribute("stroke", `rgba(${blendR}, ${blendG}, ${blendB}, ${opacity.toFixed(3)})`);
            line.setAttribute("stroke-width", hoverLine ? "1" : "0.5");
            lineCount += 1;
          }
        }
      }
    }

    for (let index = lineCount; index < lines.length; index += 1) {
      lines[index].style.display = "none";
    }

    let cursorLineCount = 0;
    for (let index = 0; index < activeCount; index += 1) {
      if (cursorLineCount >= cursorLines.length) {
        break;
      }
      const x = particles[index * stride];
      const y = particles[index * stride + 1];
      const distance = Math.hypot(x - state.mouseX, y - state.mouseY);
      if (distance > cursorDistance) {
        continue;
      }

      const line = cursorLines[cursorLineCount];
      line.style.display = "";
      line.setAttribute("x1", state.mouseX.toFixed(2));
      line.setAttribute("y1", state.mouseY.toFixed(2));
      line.setAttribute("x2", x.toFixed(2));
      line.setAttribute("y2", y.toFixed(2));
      line.setAttribute("stroke", "rgba(123, 207, 202, 0.3)");
      line.setAttribute("stroke-width", "0.8");
      line.setAttribute("stroke-dashoffset", constellation.dashOffset.toFixed(2));
      cursorLineCount += 1;
    }

    for (let index = cursorLineCount; index < cursorLines.length; index += 1) {
      cursorLines[index].style.display = "none";
    }

    if (constellation.hoverState.element instanceof HTMLElement) {
      constellation.glow.setAttribute("cx", constellation.hoverState.x.toFixed(2));
      constellation.glow.setAttribute("cy", constellation.hoverState.y.toFixed(2));
      constellation.glow.setAttribute("r", "180");
      constellation.glow.setAttribute("opacity", "0.65");
    } else {
      constellation.glow.setAttribute("opacity", "0");
    }

    constellation.svg.setAttribute("viewBox", `0 0 ${state.viewportWidth} ${state.viewportHeight}`);
  }

  function createDepthScene() {
    if (reducedMotion || !siteShell || siteShell.parentElement?.classList.contains("depth-scene")) {
      return null;
    }

    const scene = doc.createElement("div");
    scene.className = "depth-scene";
    const atmosphere = doc.createElement("div");
    atmosphere.className = "depth-atmosphere";
    const fogCanvas = doc.createElement("canvas");
    fogCanvas.className = "fog-canvas";
    const rayCanvas = doc.createElement("canvas");
    rayCanvas.className = "godray-canvas";
    const moteLayer = doc.createElement("div");
    moteLayer.className = "depth-motes";

    atmosphere.appendChild(fogCanvas);
    atmosphere.appendChild(rayCanvas);
    atmosphere.appendChild(moteLayer);

    const parent = siteShell.parentElement;
    if (!parent) {
      return null;
    }

    parent.insertBefore(scene, siteShell);
    scene.appendChild(atmosphere);
    scene.appendChild(siteShell);

    return { scene, atmosphere, fogCanvas, rayCanvas, moteLayer };
  }

  function assignDepthLayer(element, layer, z, blur) {
    if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) {
      return;
    }

    element.classList.add("depth-node");
    element.style.setProperty("--depth-z", `${z}px`);
    element.style.setProperty("--depth-scale", `${1 - z / 1200}`);
    element.style.setProperty("--depth-blur", `${blur}px`);
    depthLayers.push({ element, layer, z, blur });
  }

  function setupVolumetricDepth() {
    if (reducedMotion) {
      return;
    }

    const sceneParts = createDepthScene();
    if (!sceneParts) {
      return;
    }

    const fogCtx = sceneParts.fogCanvas.getContext("2d", { alpha: true });
    const rayCtx = sceneParts.rayCanvas.getContext("2d", { alpha: true });
    if (!fogCtx || !rayCtx) {
      sceneParts.scene.remove();
      return;
    }

    const resizeCanvases = () => {
      const dpr = Math.min(win.devicePixelRatio || 1, 2);
      [sceneParts.fogCanvas, sceneParts.rayCanvas].forEach((canvas) => {
        canvas.width = Math.max(1, Math.round(state.viewportWidth * dpr));
        canvas.height = Math.max(1, Math.round(state.viewportHeight * dpr));
        canvas.style.width = `${state.viewportWidth}px`;
        canvas.style.height = `${state.viewportHeight}px`;
      });

      fogCtx.setTransform(1, 0, 0, 1, 0, 0);
      rayCtx.setTransform(1, 0, 0, 1, 0, 0);
      fogCtx.scale(dpr, dpr);
      rayCtx.scale(dpr, dpr);
    };

    const dustPalette = [
      "rgba(255,255,255,0.34)",
      "rgba(245,230,192,0.28)",
      "rgba(184,228,220,0.24)",
    ];

    for (let index = 0; index < 48; index += 1) {
      const mote = doc.createElement("div");
      mote.className = "depth-mote";
      sceneParts.moteLayer.appendChild(mote);
      const layer = index % 5;
      const depth = [-400, -200, -80, 0, 60][layer];
      mote.style.background = dustPalette[index % dustPalette.length];
      mote.style.width = `${2 + (index % 3)}px`;
      mote.style.height = mote.style.width;
      depthMotes.push({
        element: mote,
        depth,
        baseX: Math.random(),
        baseY: Math.random(),
        phase: Math.random() * Math.PI * 2,
        speed: 0.1 + Math.random() * 0.4,
      });
    }

    siteShell.querySelectorAll(".grain-overlay").forEach((element) => assignDepthLayer(element, 1, -200, 3));
    siteShell.querySelectorAll(".orb, .mountains").forEach((element) => assignDepthLayer(element, 2, -80, 1.5));
    siteShell.querySelectorAll(".hero-illustration, .mini-illustration svg").forEach((element) => assignDepthLayer(element, 4, 60, 0.8));
    siteShell.querySelectorAll(".hero-copy, .section-heading, .quote-layout, .contact-rows, .contact-form").forEach((element) =>
      assignDepthLayer(element, 3, 0, 0)
    );
    siteShell.querySelectorAll(".feature, .detail-card, .flow-step, .page-link-row, .contact-row").forEach((element) => {
      assignDepthLayer(element, 3, 0, 0);
      if (element instanceof HTMLElement) {
        depthCards.push(element);
        rememberElement(element);
        element.addEventListener("mouseenter", () => {
          state.depthFocusTarget = -80;
        });
        element.addEventListener("mouseleave", () => {
          state.depthFocusTarget = 0;
        });
      }
    });

    const quoteBand = doc.querySelector(".quote-band");
    const heroSection = doc.querySelector(".hero, .subpage-hero");
    rememberElement(quoteBand);
    rememberElement(heroSection);
    state.depthScene = {
      ...sceneParts,
      fogCtx,
      rayCtx,
      resizeCanvases,
      heroSection,
      quoteBand,
      density: 0.002,
      focusZ: 0,
      focusTarget: 0,
    };

    resizeCanvases();
    scheduleLayoutRefresh();
  }

  function updateVolumetricDepth(now) {
    if (!state.depthScene || reducedMotion) {
      return;
    }

    const scene = state.depthScene;
    const performanceMode = state.performanceMode || "high";
    const scrollMix = state.maxScroll > 0 ? clamp(state.currentScroll / state.maxScroll, 0, 1) : 0;
    const cursorMix = clamp(state.mouseX / Math.max(state.viewportWidth, 1), 0, 1) * 2 - 1;
    const povY = 30 + scrollMix * 40;
    scene.scene.style.setProperty("--pov-y", `${povY}%`);
    scene.density = mix(scene.density, 0.002 + scrollMix * 0.004, 0.08);
    scene.focusTarget = state.depthFocusTarget || 0;
    scene.focusZ = lerp(scene.focusZ, scene.focusTarget, 0.08);

    if (performanceMode !== "low" || state.frameIndex % 2 === 0) {
      depthLayers.forEach((entry) => {
        const focusDistance = Math.abs(entry.z - scene.focusZ);
        const blur = entry.blur + focusDistance / (performanceMode === "high" ? 220 : 260);
        entry.element.style.setProperty("--depth-dynamic-blur", `${blur.toFixed(2)}px`);
      });
    }

    const fogCtx = scene.fogCtx;
    fogCtx.clearRect(0, 0, state.viewportWidth, state.viewportHeight);
    fogCtx.fillStyle = "rgba(245,230,192,0.05)";
    fogCtx.fillRect(0, 0, state.viewportWidth, state.viewportHeight);
    const fogStops = [
      { depth: -400, radius: state.viewportWidth * 0.82, alpha: 0.26 },
      { depth: -200, radius: state.viewportWidth * 0.58, alpha: 0.18 },
      { depth: -80, radius: state.viewportWidth * 0.34, alpha: 0.12 },
    ];

    fogStops.forEach((stop, index) => {
      const fogFactor = 1 - Math.exp(-scene.density * Math.abs(stop.depth) * Math.abs(stop.depth) * 0.0001);
      const centerX = state.viewportWidth * (0.22 + index * 0.34 + cursorMix * 0.04);
      const centerY = state.viewportHeight * (0.18 + index * 0.24 - scrollMix * 0.08);
      const gradient = fogCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, stop.radius);
      gradient.addColorStop(0, `rgba(245,230,192,${(stop.alpha * fogFactor).toFixed(3)})`);
      gradient.addColorStop(1, "rgba(245,230,192,0)");
      fogCtx.fillStyle = gradient;
      fogCtx.beginPath();
      fogCtx.rect(0, 0, state.viewportWidth, state.viewportHeight);
      fogCtx.fill();
    });

    const rayCtx = scene.rayCtx;
    rayCtx.clearRect(0, 0, state.viewportWidth, state.viewportHeight);
    rayCtx.globalCompositeOperation = "screen";
    const heroRect = scene.heroSection instanceof HTMLElement ? getViewportMetrics(scene.heroSection, false) : null;
    const quoteRect = scene.quoteBand instanceof HTMLElement ? getViewportMetrics(scene.quoteBand, false) : null;
    const lightSources = [
      heroRect
        ? {
          x: heroRect.left + heroRect.width * (0.78 + cursorMix * 0.06),
          y: heroRect.top + heroRect.height * 0.08,
          radius: state.viewportWidth * 0.52,
          angle: cursorMix * 20,
        }
        : null,
      quoteRect
        ? {
          x: quoteRect.left + quoteRect.width * 0.52,
          y: quoteRect.top + quoteRect.height * 0.16,
          radius: state.viewportWidth * 0.34,
          angle: -8,
        }
        : null,
    ].filter(Boolean);

    const raySamples = performanceMode === "high" ? 8 : performanceMode === "medium" ? 5 : 3;
    lightSources.forEach((source, index) => {
      for (let sample = 0; sample < raySamples; sample += 1) {
        const spread = source.radius * (sample / Math.max(raySamples, 1));
        const beamAngle = (source.angle * Math.PI) / 180;
        const dx = Math.cos(beamAngle) * spread;
        const dy = Math.sin(beamAngle + index * 0.18) * spread * 0.2 + spread * 0.58;
        const gradient = rayCtx.createRadialGradient(source.x + dx, source.y + dy, 0, source.x + dx, source.y + dy, source.radius);
        gradient.addColorStop(0, `rgba(255,248,223,${(0.042 - sample * 0.003).toFixed(3)})`);
        gradient.addColorStop(0.5, `rgba(255,248,223,${(0.02 - sample * 0.0014).toFixed(3)})`);
        gradient.addColorStop(1, "rgba(255,248,223,0)");
        rayCtx.fillStyle = gradient;
        rayCtx.fillRect(0, 0, state.viewportWidth, state.viewportHeight);
      }
    });
    rayCtx.globalCompositeOperation = "source-over";

    const moteStride = performanceMode === "high" ? 1 : performanceMode === "medium" ? 2 : 3;
    depthMotes.forEach((mote, index) => {
      if (index % moteStride !== state.frameIndex % moteStride) {
        return;
      }
      const driftX = (noise2D(now * 0.00012 + mote.phase, index * 0.17) - 0.5) * mote.speed * 80;
      const driftY = (noise2D(index * 0.11, now * 0.00015 + mote.phase) - 0.5) * mote.speed * 80;
      const depthFactor = 1 + Math.abs(mote.depth) / 420;
      const x = mote.baseX * state.viewportWidth + driftX / depthFactor + cursorMix * 6;
      const y = mote.baseY * state.viewportHeight + driftY / depthFactor - scrollMix * 40;
      const opacity = 0.15 + ((Math.sin(now * 0.0015 * mote.speed + mote.phase) + 1) * 0.175) / depthFactor;
      mote.element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translateZ(${mote.depth}px) scale(${(1 - mote.depth / 1200).toFixed(3)})`;
      mote.element.style.opacity = opacity.toFixed(3);
      mote.element.style.filter = `blur(${(Math.abs(mote.depth) / 300).toFixed(2)}px)`;
    });

    const primaryLight = lightSources[0] || { x: state.viewportWidth * 0.8, y: state.viewportHeight * 0.08 };
    const shadowStride = performanceMode === "high" ? 1 : performanceMode === "medium" ? 2 : 4;
    depthCards.forEach((card, index) => {
      if (index % shadowStride !== state.frameIndex % shadowStride) {
        return;
      }
      const rect = getViewportMetrics(card, false);
      if (!rect) {
        return;
      }
      if (rect.bottom < -80 || rect.top > state.viewportHeight + 80) {
        return;
      }
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const dx = cx - primaryLight.x;
      const dy = cy - primaryLight.y;
      const distance = Math.hypot(dx, dy) || 1;
      const shadowX = clamp(dx / 26, -18, 18);
      const shadowY = clamp(dy / 20, 8, 26);
      const blur = clamp(16 + distance / 42, 16, 42);
      const opacity = clamp(0.14 - distance / 3200, 0.06, 0.14);
      card.style.boxShadow = `${shadowX.toFixed(1)}px ${shadowY.toFixed(1)}px ${blur.toFixed(1)}px rgba(42, 33, 24, ${opacity.toFixed(3)})`;
    });
  }

  function getSingleWebGLContext(canvas) {
    const attributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    };

    if (win.WebGL2RenderingContext) {
      const webgl2 = canvas.getContext("webgl2", attributes);
      if (webgl2) {
        return { gl: webgl2, isWebGL2: true };
      }
    }

    if (win.WebGLRenderingContext) {
      const webgl =
        canvas.getContext("webgl", attributes) ||
        canvas.getContext("experimental-webgl", attributes);
      if (webgl) {
        return { gl: webgl, isWebGL2: false };
      }
    }

    return { gl: null, isWebGL2: false };
  }

  function createInkStage() {
    const stage = doc.createElement("div");
    stage.className = "ink-stage";
    stage.style.background = "#dfeffc";
    const canvas = doc.createElement("canvas");
    canvas.className = "ink-canvas";
    canvas.style.background = "#dfeffc";
    stage.appendChild(canvas);
    body.insertBefore(stage, body.firstChild);
    return { stage, canvas };
  }

  function createInkFallback() {
    if (reducedMotion || !body.classList.contains("has-gradient-motion")) {
      setInkModeBadge("off");
      return null;
    }

    const inkStage = createInkStage();
    const stage = inkStage.stage;
    const canvas = inkStage.canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      stage.remove();
      body.classList.remove("has-webgl-ink");
      setInkModeBadge("off");
      return null;
    }
    setInkModeBadge("fallback");

    const palette = [
      "242,196,206",
      "184,228,220",
      "217,200,232",
      "245,230,192",
      "168,216,216",
    ];
    const blobs = Array.from({ length: 6 }, (_, index) => ({
      seed: index * 19 + Math.random() * 100,
      color: palette[index % palette.length],
      x: Math.random(),
      y: Math.random(),
      radius: 140 + Math.random() * 220,
      driftX: Math.random() * 0.4 - 0.2,
      driftY: Math.random() * 0.4 - 0.2,
    }));
    let pointer = { x: 0.5, y: 0.5, active: false };
    let disposed = false;
    let grainCanvas = null;

    function applyResize() {
      const dpr = Math.min(win.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(state.viewportWidth * dpr));
      canvas.height = Math.max(1, Math.round(state.viewportHeight * dpr));
      canvas.style.width = `${state.viewportWidth}px`;
      canvas.style.height = `${state.viewportHeight}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    const resize = debounce(applyResize, 96);

    const onMove = throttleInterval((event) => {
      pointer.x = event.clientX / Math.max(state.viewportWidth, 1);
      pointer.y = event.clientY / Math.max(state.viewportHeight, 1);
      pointer.active = true;
    }, 32);

    function draw(time) {
      if (disposed) {
        return;
      }

      const width = state.viewportWidth;
      const height = state.viewportHeight;
      const scrollMix = state.maxScroll > 0 ? clamp(state.currentScroll / state.maxScroll, 0, 1) : 0;
      ctx.fillStyle = "#dfeffc";
      ctx.fillRect(0, 0, width, height);

      blobs.forEach((blob, index) => {
        const orbitX = Math.sin(time * 0.00008 + blob.seed) * 0.16;
        const orbitY = Math.cos(time * 0.00006 + blob.seed * 1.7) * 0.16;
        const influence = pointer.active ? 0.04 + scrollMix * 0.06 : 0;
        const x = clamp(blob.x + orbitX + (pointer.x - 0.5) * influence, 0.08, 0.92) * width;
        const y = clamp(blob.y + orbitY + (pointer.y - 0.5) * influence, 0.08, 0.92) * height;
        const radius = blob.radius * (1 + scrollMix * 0.28 + Math.sin(time * 0.0002 + index) * 0.08);
        const gradient = ctx.createRadialGradient(x, y, radius * 0.12, x, y, radius);
        gradient.addColorStop(0, `rgba(${blob.color}, ${0.35 + scrollMix * 0.12})`);
        gradient.addColorStop(0.45, `rgba(${blob.color}, ${0.18 + scrollMix * 0.06})`);
        gradient.addColorStop(1, `rgba(${blob.color}, 0)`);
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      if (grainCanvas) {
        ctx.globalCompositeOperation = "soft-light";
        ctx.drawImage(grainCanvas, 0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      }
    }

    function destroy() {
      if (disposed) {
        return;
      }

      disposed = true;
      win.removeEventListener("resize", resize);
      win.removeEventListener("mousemove", onMove);
      stage.remove();
      body.classList.remove("has-webgl-ink");
    }

    win.addEventListener("resize", resize);
    win.addEventListener("mousemove", onMove, { passive: true });
    applyResize();
    grainCanvas = doc.createElement("canvas");
    const grainCtx = grainCanvas.getContext("2d");
    grainCanvas.width = canvas.width;
    grainCanvas.height = canvas.height;
    if (grainCtx) {
      grainCtx.globalCompositeOperation = "soft-light";
      for (let x = 0; x < grainCanvas.width; x += 14) {
        for (let y = 0; y < grainCanvas.height; y += 14) {
          const grain = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 0.06;
          grainCtx.fillStyle = `rgba(42,33,24,${Math.abs(grain)})`;
          grainCtx.fillRect(x, y, 1.5, 1.5);
        }
      }
    }

    return {
      destroy,
      update(now) {
        draw(now);
      },
      resize,
    };
  }

  function createInkSimulation() {
    if (reducedMotion || !body.classList.contains("has-gradient-motion")) {
      setInkModeBadge("off");
      return null;
    }

    const inkStage = createInkStage();
    const stage = inkStage.stage;
    const canvas = inkStage.canvas;

    const webglContext = getSingleWebGLContext(canvas);
    const gl = webglContext.gl;

    if (!gl) {
      stage.remove();
      body.classList.remove("has-webgl-ink");
      setInkModeBadge("fallback");
      return createInkFallback();
    }

    const isWebGL2 = webglContext.isWebGL2;
    const halfFloatExt = isWebGL2
      ? gl.getExtension("EXT_color_buffer_float")
      : gl.getExtension("OES_texture_half_float");
    const linearFloatExt = gl.getExtension("OES_texture_half_float_linear") || gl.getExtension("OES_texture_float_linear");
    if (!halfFloatExt) {
      stage.remove();
      body.classList.remove("has-webgl-ink");
      setInkModeBadge("fallback");
      return createInkFallback();
    }
    setInkModeBadge("webgl");

    const textureType = isWebGL2 ? gl.HALF_FLOAT : halfFloatExt.HALF_FLOAT_OES;
    const textureFormat = isWebGL2 ? gl.RGBA16F : gl.RGBA;
    const textureInternal = isWebGL2 ? gl.RGBA16F : gl.RGBA;
    const linearFilter = linearFloatExt ? gl.LINEAR : gl.NEAREST;
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const vertexShaderSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const clearShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_texture;
      uniform float u_decay;
      void main() {
        gl_FragColor = texture2D(u_texture, v_uv) * u_decay;
      }
    `;

    const advectShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_velocity;
      uniform sampler2D u_source;
      uniform vec2 u_texel;
      uniform float u_dt;
      uniform float u_dissipation;
      void main() {
        vec2 velocity = texture2D(u_velocity, v_uv).xy;
        vec2 coord = v_uv - u_dt * velocity * u_texel;
        gl_FragColor = texture2D(u_source, coord) * u_dissipation;
      }
    `;

    const divergenceShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_velocity;
      uniform vec2 u_texel;
      void main() {
        float L = texture2D(u_velocity, v_uv - vec2(u_texel.x, 0.0)).x;
        float R = texture2D(u_velocity, v_uv + vec2(u_texel.x, 0.0)).x;
        float B = texture2D(u_velocity, v_uv - vec2(0.0, u_texel.y)).y;
        float T = texture2D(u_velocity, v_uv + vec2(0.0, u_texel.y)).y;
        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
      }
    `;

    const pressureShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_pressure;
      uniform sampler2D u_divergence;
      uniform vec2 u_texel;
      void main() {
        float L = texture2D(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;
        float R = texture2D(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;
        float B = texture2D(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;
        float T = texture2D(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;
        float div = texture2D(u_divergence, v_uv).x;
        float pressure = (L + R + B + T - div) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
      }
    `;

    const gradientSubtractShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_pressure;
      uniform sampler2D u_velocity;
      uniform vec2 u_texel;
      void main() {
        float L = texture2D(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;
        float R = texture2D(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;
        float B = texture2D(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;
        float T = texture2D(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;
        vec2 velocity = texture2D(u_velocity, v_uv).xy;
        velocity -= vec2(R - L, T - B) * 0.5;
        gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
    `;

    const splatShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_target;
      uniform vec2 u_point;
      uniform vec3 u_color;
      uniform float u_radius;
      uniform float u_aspect;
      void main() {
        vec2 p = v_uv - u_point;
        p.x *= u_aspect;
        float falloff = exp(-dot(p, p) / max(u_radius, 0.0001));
        vec4 base = texture2D(u_target, v_uv);
        gl_FragColor = base + vec4(u_color * falloff, falloff);
      }
    `;

    const vorticityShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_velocity;
      uniform vec2 u_texel;
      void main() {
        float L = texture2D(u_velocity, v_uv - vec2(u_texel.x, 0.0)).y;
        float R = texture2D(u_velocity, v_uv + vec2(u_texel.x, 0.0)).y;
        float B = texture2D(u_velocity, v_uv - vec2(0.0, u_texel.y)).x;
        float T = texture2D(u_velocity, v_uv + vec2(0.0, u_texel.y)).x;
        float curl = R - L - T + B;
        gl_FragColor = vec4(curl, 0.0, 0.0, 1.0);
      }
    `;

    const vorticityForceShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_velocity;
      uniform sampler2D u_curl;
      uniform vec2 u_texel;
      uniform float u_curlStrength;
      uniform float u_dt;
      void main() {
        float L = abs(texture2D(u_curl, v_uv - vec2(u_texel.x, 0.0)).x);
        float R = abs(texture2D(u_curl, v_uv + vec2(u_texel.x, 0.0)).x);
        float B = abs(texture2D(u_curl, v_uv - vec2(0.0, u_texel.y)).x);
        float T = abs(texture2D(u_curl, v_uv + vec2(0.0, u_texel.y)).x);
        float C = texture2D(u_curl, v_uv).x;
        vec2 force = 0.5 * vec2(T - B, L - R);
        force /= length(force) + 0.0001;
        force *= u_curlStrength * C;
        vec2 velocity = texture2D(u_velocity, v_uv).xy;
        velocity += force * u_dt;
        gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
    `;

    const bloomPrefilterShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_texture;
      void main() {
        vec3 color = texture2D(u_texture, v_uv).rgb;
        float luma = dot(color, vec3(0.299, 0.587, 0.114));
        float intensity = smoothstep(0.14, 0.68, luma);
        gl_FragColor = vec4(color * intensity, 1.0);
      }
    `;

    const bloomBlurShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_texture;
      uniform vec2 u_texel;
      uniform vec2 u_direction;
      void main() {
        vec3 sum = vec3(0.0);
        sum += texture2D(u_texture, v_uv - 4.0 * u_texel * u_direction).rgb * 0.051;
        sum += texture2D(u_texture, v_uv - 3.0 * u_texel * u_direction).rgb * 0.0918;
        sum += texture2D(u_texture, v_uv - 2.0 * u_texel * u_direction).rgb * 0.12245;
        sum += texture2D(u_texture, v_uv - 1.0 * u_texel * u_direction).rgb * 0.1531;
        sum += texture2D(u_texture, v_uv).rgb * 0.1633;
        sum += texture2D(u_texture, v_uv + 1.0 * u_texel * u_direction).rgb * 0.1531;
        sum += texture2D(u_texture, v_uv + 2.0 * u_texel * u_direction).rgb * 0.12245;
        sum += texture2D(u_texture, v_uv + 3.0 * u_texel * u_direction).rgb * 0.0918;
        sum += texture2D(u_texture, v_uv + 4.0 * u_texel * u_direction).rgb * 0.051;
        gl_FragColor = vec4(sum, 1.0);
      }
    `;

    const compositeShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_dye;
      uniform sampler2D u_bloom;
      uniform vec2 u_canvas;
      uniform vec3 u_bg;
      uniform float u_time;
      float rand(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      void main() {
        vec4 dyeSample = texture2D(u_dye, v_uv);
        vec3 dye = dyeSample.rgb;
        float dyeAlpha = dyeSample.a;
        vec3 bloom = texture2D(u_bloom, v_uv).rgb;
        vec2 grainUv = (v_uv * u_canvas + vec2(u_time * 11.0, -u_time * 7.0)) / 14.0;
        float grain = rand(floor(grainUv)) * 2.0 - 1.0;

        vec3 watercolor = dye + bloom * 0.6;
        float intensity = length(watercolor) * 0.58;
        intensity = smoothstep(0.0, 0.5, intensity);

        vec3 tint = normalize(watercolor + 0.001) * 0.85;
        tint = mix(tint, watercolor, 0.4);

        vec3 color = u_bg;
        color = mix(color, color * (1.0 - intensity * 0.15) + tint * intensity * 0.45, smoothstep(0.01, 0.1, intensity));

        color += grain * 0.02;
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      }
    `;

    function createShader(type, source) {
      const shader = gl.createShader(type);
      if (!shader) {
        return null;
      }
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    function createProgram(vertexSource, fragmentSource) {
      const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
      if (!vertexShader || !fragmentShader) {
        return null;
      }
      const program = gl.createProgram();
      if (!program) {
        return null;
      }
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        return null;
      }
      return {
        program,
        position: gl.getAttribLocation(program, "a_position"),
      };
    }

    function createTexture(width, height, filter) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (isWebGL2) {
        gl.texImage2D(gl.TEXTURE_2D, 0, textureInternal, width, height, 0, gl.RGBA, textureType, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, textureFormat, width, height, 0, gl.RGBA, textureType, null);
      }
      return texture;
    }

    function createFBO(width, height, filter) {
      const texture = createTexture(width, height, filter);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      return { texture, framebuffer, width, height };
    }

    function isFramebufferComplete(target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }

    function createDoubleFBO(width, height, filter) {
      let read = createFBO(width, height, filter);
      let write = createFBO(width, height, filter);
      return {
        get read() {
          return read;
        },
        get write() {
          return write;
        },
        swap() {
          const next = read;
          read = write;
          write = next;
        },
      };
    }

    function createPass(programConfig) {
      if (!programConfig) {
        return null;
      }
      return {
        program: programConfig.program,
        position: programConfig.position,
        uniforms: {},
      };
    }

    const passes = {
      clear: createPass(createProgram(vertexShaderSource, clearShaderSource)),
      advect: createPass(createProgram(vertexShaderSource, advectShaderSource)),
      divergence: createPass(createProgram(vertexShaderSource, divergenceShaderSource)),
      pressure: createPass(createProgram(vertexShaderSource, pressureShaderSource)),
      gradientSubtract: createPass(createProgram(vertexShaderSource, gradientSubtractShaderSource)),
      splat: createPass(createProgram(vertexShaderSource, splatShaderSource)),
      curl: createPass(createProgram(vertexShaderSource, vorticityShaderSource)),
      vorticity: createPass(createProgram(vertexShaderSource, vorticityForceShaderSource)),
      bloomPrefilter: createPass(createProgram(vertexShaderSource, bloomPrefilterShaderSource)),
      bloomBlur: createPass(createProgram(vertexShaderSource, bloomBlurShaderSource)),
      composite: createPass(createProgram(vertexShaderSource, compositeShaderSource)),
    };

    if (Object.values(passes).some((pass) => !pass)) {
      stage.remove();
      body.classList.remove("has-webgl-ink");
      return createInkFallback();
    }

    function cacheUniforms(pass, names) {
      names.forEach((name) => {
        pass.uniforms[name] = gl.getUniformLocation(pass.program, name);
      });
    }

    cacheUniforms(passes.clear, ["u_texture", "u_decay"]);
    cacheUniforms(passes.advect, ["u_velocity", "u_source", "u_texel", "u_dt", "u_dissipation"]);
    cacheUniforms(passes.divergence, ["u_velocity", "u_texel"]);
    cacheUniforms(passes.pressure, ["u_pressure", "u_divergence", "u_texel"]);
    cacheUniforms(passes.gradientSubtract, ["u_pressure", "u_velocity", "u_texel"]);
    cacheUniforms(passes.splat, ["u_target", "u_point", "u_color", "u_radius", "u_aspect"]);
    cacheUniforms(passes.curl, ["u_velocity", "u_texel"]);
    cacheUniforms(passes.vorticity, ["u_velocity", "u_curl", "u_texel", "u_curlStrength", "u_dt"]);
    cacheUniforms(passes.bloomPrefilter, ["u_texture"]);
    cacheUniforms(passes.bloomBlur, ["u_texture", "u_texel", "u_direction"]);
    cacheUniforms(passes.composite, ["u_dye", "u_bloom", "u_canvas", "u_bg", "u_time"]);

    function bindPass(pass) {
      gl.useProgram(pass.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(pass.position);
      gl.vertexAttribPointer(pass.position, 2, gl.FLOAT, false, 0, 0);
    }

    function bindTexture(texture, unit, uniform) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (uniform) {
        gl.uniform1i(uniform, unit);
      }
    }

    function drawTo(target, width, height) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.viewport(0, 0, width, height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function clearSingleFBO(target) {
      if (!target) {
        return;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    const performanceProfiles = [
      { scale: 0.25, ambientInterval: 140, pressureIterations: 8, bloom: true },
      { scale: 0.1875, ambientInterval: 200, pressureIterations: 6, bloom: true },
      { scale: 0.125, ambientInterval: 280, pressureIterations: 4, bloom: false },
    ];
    let profileIndex = 0;
    let scale = performanceProfiles[profileIndex].scale;
    let simWidth = 0;
    let simHeight = 0;
    let bloomWidth = 0;
    let bloomHeight = 0;
    let velocity = null;
    let dye = null;
    let pressure = null;
    let divergence = null;
    let curl = null;
    let bloomPrefilter = null;
    let bloomBlur = null;
    let frameTimeTotal = 0;
    const frameTimes = [];
    let lastMouse = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, speed: 0 };
    let lastAmbientAt = 0;
    let lastCursorSplatAt = 0;
    let queuedCursorSplat = null;
    let disposed = false;
    let visibilityPaused = false;
    let viewportActive = true;
    let intersectionObserver = null;
    const cursorColor = [0.892, 0.643, 0.855];
    const baseColor = [0.91, 0.945, 0.973];
    const palette = [
      [0.949, 0.769, 0.808],
      [0.722, 0.894, 0.863],
      [0.851, 0.784, 0.910],
      [0.961, 0.902, 0.753],
      [0.659, 0.847, 0.847],
    ];
    const emitters = Array.from({ length: 4 }, (_, index) => ({
      seedA: Math.random() * 200 + index * 13,
      seedB: Math.random() * 200 + index * 29,
      seedC: Math.random() * 200 + index * 7,
      hue: index % palette.length,
    }));

    function valueNoise(x, y) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const fade = (t) => t * t * (3 - 2 * t);
      const sample = (sx, sy) => {
        const n = Math.sin(sx * 127.1 + sy * 311.7) * 43758.5453123;
        return n - Math.floor(n);
      };
      const a = sample(ix, iy);
      const b = sample(ix + 1, iy);
      const c = sample(ix, iy + 1);
      const d = sample(ix + 1, iy + 1);
      const ux = fade(fx);
      const uy = fade(fy);
      return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
    }

    function destroyFBO(target) {
      if (!target) {
        return;
      }

      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
    }

    function destroyDoubleFBO(target) {
      if (!target) {
        return;
      }

      destroyFBO(target.read);
      destroyFBO(target.write);
    }

    function destroyResources() {
      destroyDoubleFBO(velocity);
      destroyDoubleFBO(dye);
      destroyDoubleFBO(pressure);
      destroyFBO(divergence);
      destroyFBO(curl);
      destroyFBO(bloomPrefilter);
      destroyFBO(bloomBlur);
      velocity = null;
      dye = null;
      pressure = null;
      divergence = null;
      curl = null;
      bloomPrefilter = null;
      bloomBlur = null;
    }

    function resizeFramebuffers() {
      const dpr = Math.min(win.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(state.viewportWidth * scale * dpr));
      const height = Math.max(1, Math.round(state.viewportHeight * scale * dpr));
      if (width === simWidth && height === simHeight) {
        return;
      }

      destroyResources();

      simWidth = width;
      simHeight = height;
      bloomWidth = Math.max(1, Math.round(width * 0.5));
      bloomHeight = Math.max(1, Math.round(height * 0.5));

      velocity = createDoubleFBO(simWidth, simHeight, linearFilter);
      dye = createDoubleFBO(simWidth, simHeight, linearFilter);
      pressure = createDoubleFBO(simWidth, simHeight, gl.NEAREST);
      divergence = createFBO(simWidth, simHeight, gl.NEAREST);
      curl = createFBO(simWidth, simHeight, gl.NEAREST);
      bloomPrefilter = createFBO(bloomWidth, bloomHeight, linearFilter);
      bloomBlur = createFBO(bloomWidth, bloomHeight, linearFilter);

      const buffersValid = [
        velocity.read,
        velocity.write,
        dye.read,
        dye.write,
        pressure.read,
        pressure.write,
        divergence,
        curl,
        bloomPrefilter,
        bloomBlur,
      ].every(isFramebufferComplete);
      if (!buffersValid) {
        throw new Error("Ink simulation framebuffers are incomplete");
      }

      const dprWidth = Math.floor(state.viewportWidth * dpr);
      const dprHeight = Math.floor(state.viewportHeight * dpr);
      canvas.width = Math.max(1, dprWidth);
      canvas.height = Math.max(1, dprHeight);
      canvas.style.width = `${state.viewportWidth}px`;
      canvas.style.height = `${state.viewportHeight}px`;
    }

    function runSplat(targetFbo, pointX, pointY, color, radius) {
      bindPass(passes.splat);
      bindTexture(targetFbo.read.texture, 0, passes.splat.uniforms.u_target);
      gl.uniform2f(passes.splat.uniforms.u_point, pointX, pointY);
      gl.uniform3f(passes.splat.uniforms.u_color, color[0], color[1], color[2]);
      gl.uniform1f(passes.splat.uniforms.u_radius, radius);
      gl.uniform1f(passes.splat.uniforms.u_aspect, simWidth / Math.max(simHeight, 1));
      drawTo(targetFbo.write, simWidth, simHeight);
      targetFbo.swap();
    }

    function splat(x, y, color, radiusPx, velocityImpulse) {
      const pointX = clamp(x, 0, 1);
      const pointY = clamp(1 - y, 0, 1);
      const radius = Math.pow(radiusPx / Math.max(simWidth, simHeight, 1), 2) * 38;
      runSplat(dye, pointX, pointY, color, radius);
      runSplat(velocity, pointX, pointY, [velocityImpulse.x, -velocityImpulse.y, 0], radius * 0.66);
    }

    function clearField(target, decay) {
      bindPass(passes.clear);
      bindTexture(target.read.texture, 0, passes.clear.uniforms.u_texture);
      gl.uniform1f(passes.clear.uniforms.u_decay, decay);
      drawTo(target.write, target.read.width, target.read.height);
      target.swap();
    }

    function flushCursorSplat() {
      if (!queuedCursorSplat || !velocity || !dye) {
        return;
      }

      splat(
        queuedCursorSplat.x,
        queuedCursorSplat.y,
        cursorColor,
        queuedCursorSplat.radius,
        queuedCursorSplat.impulse
      );
      queuedCursorSplat = null;
    }

    const updateMouse = throttleInterval((event) => {
      const x = event.clientX / Math.max(state.viewportWidth, 1);
      const y = event.clientY / Math.max(state.viewportHeight, 1);
      const dx = x - lastMouse.x;
      const dy = y - lastMouse.y;
      lastMouse.px = lastMouse.x;
      lastMouse.py = lastMouse.y;
      lastMouse.x = x;
      lastMouse.y = y;
      lastMouse.speed = Math.min(Math.hypot(dx, dy) * 18, 1.8);

      const now = performance.now();
      if (now - lastCursorSplatAt < 24 && queuedCursorSplat) {
        queuedCursorSplat.x = x;
        queuedCursorSplat.y = y;
        queuedCursorSplat.impulse.x = clamp(dx * 30, -2.4, 2.4);
        queuedCursorSplat.impulse.y = clamp(dy * 30, -2.4, 2.4);
        return;
      }

      queuedCursorSplat = {
        x,
        y,
        radius: 58,
        impulse: {
          x: clamp(dx * 30, -2.4, 2.4),
          y: clamp(dy * 30, -2.4, 2.4),
        },
      };
      lastCursorSplatAt = now;
    }, 32);

    function injectAmbient(time) {
      if (time - lastAmbientAt < performanceProfiles[profileIndex].ambientInterval) {
        return;
      }

      lastAmbientAt = time;
      const splatCount = Math.min(4, 2 + profileIndex);
      const driftSpeed = 0.3;
      for (let index = 0; index < splatCount; index += 1) {
        const emitter = emitters[index];
        const noiseX = valueNoise(time * 0.000035 + emitter.seedA, emitter.seedB);
        const noiseY = valueNoise(time * 0.000035 + emitter.seedC, emitter.seedA);
        const microX = Math.sin(time * 0.00012 + emitter.seedA) * driftSpeed / Math.max(simWidth, 1);
        const microY = Math.cos(time * 0.00011 + emitter.seedB) * driftSpeed / Math.max(simHeight, 1);
        const x = clamp(noiseX + microX, 0.08, 0.92);
        const y = clamp(noiseY + microY, 0.08, 0.92);
        const radius = 30 + valueNoise(time * 0.0001 + emitter.seedB, emitter.seedC) * 50;
        const vx = (valueNoise(time * 0.0002 + emitter.seedA, emitter.seedC) - 0.5) * 0.11;
        const vy = (valueNoise(time * 0.0002 + emitter.seedB, emitter.seedA) - 0.5) * 0.11;
        splat(x, y, palette[emitter.hue], radius, { x: vx, y: vy });
      }
    }

    function step(dt, time) {
      if (!velocity || !dye || !pressure || !divergence || !curl || !bloomPrefilter || !bloomBlur) {
        resizeFramebuffers();
      }

      const scrollMix = state.maxScroll > 0 ? clamp(state.currentScroll / state.maxScroll, 0, 1) : 0;
      const viscosity = 0.992 - scrollMix * 0.023;
      const dyeDissipation = 0.995 - scrollMix * 0.01;
      const curlStrength = 18 + scrollMix * 14;
      injectAmbient(time);
      flushCursorSplat();

      clearField(dye, 0.9992 - scrollMix * 0.0007);

      bindPass(passes.advect);
      bindTexture(velocity.read.texture, 0, passes.advect.uniforms.u_velocity);
      bindTexture(velocity.read.texture, 1, passes.advect.uniforms.u_source);
      gl.uniform2f(passes.advect.uniforms.u_texel, 1 / simWidth, 1 / simHeight);
      gl.uniform1f(passes.advect.uniforms.u_dt, dt * 0.9);
      gl.uniform1f(passes.advect.uniforms.u_dissipation, viscosity);
      drawTo(velocity.write, simWidth, simHeight);
      velocity.swap();

      bindTexture(velocity.read.texture, 0, passes.advect.uniforms.u_velocity);
      bindTexture(dye.read.texture, 1, passes.advect.uniforms.u_source);
      gl.uniform1f(passes.advect.uniforms.u_dissipation, dyeDissipation);
      drawTo(dye.write, simWidth, simHeight);
      dye.swap();

      bindPass(passes.curl);
      bindTexture(velocity.read.texture, 0, passes.curl.uniforms.u_velocity);
      gl.uniform2f(passes.curl.uniforms.u_texel, 1 / simWidth, 1 / simHeight);
      drawTo(curl, simWidth, simHeight);

      bindPass(passes.vorticity);
      bindTexture(velocity.read.texture, 0, passes.vorticity.uniforms.u_velocity);
      bindTexture(curl.texture, 1, passes.vorticity.uniforms.u_curl);
      gl.uniform2f(passes.vorticity.uniforms.u_texel, 1 / simWidth, 1 / simHeight);
      gl.uniform1f(passes.vorticity.uniforms.u_curlStrength, curlStrength);
      gl.uniform1f(passes.vorticity.uniforms.u_dt, dt);
      drawTo(velocity.write, simWidth, simHeight);
      velocity.swap();

      bindPass(passes.divergence);
      bindTexture(velocity.read.texture, 0, passes.divergence.uniforms.u_velocity);
      gl.uniform2f(passes.divergence.uniforms.u_texel, 1 / simWidth, 1 / simHeight);
      drawTo(divergence, simWidth, simHeight);

      clearField(pressure, 0);

      bindPass(passes.pressure);
      gl.uniform2f(passes.pressure.uniforms.u_texel, 1 / simWidth, 1 / simHeight);
      bindTexture(divergence.texture, 1, passes.pressure.uniforms.u_divergence);
      for (let iteration = 0; iteration < performanceProfiles[profileIndex].pressureIterations; iteration += 1) {
        bindTexture(pressure.read.texture, 0, passes.pressure.uniforms.u_pressure);
        drawTo(pressure.write, simWidth, simHeight);
        pressure.swap();
      }

      bindPass(passes.gradientSubtract);
      bindTexture(pressure.read.texture, 0, passes.gradientSubtract.uniforms.u_pressure);
      bindTexture(velocity.read.texture, 1, passes.gradientSubtract.uniforms.u_velocity);
      gl.uniform2f(passes.gradientSubtract.uniforms.u_texel, 1 / simWidth, 1 / simHeight);
      drawTo(velocity.write, simWidth, simHeight);
      velocity.swap();

      if (performanceProfiles[profileIndex].bloom) {
        bindPass(passes.bloomPrefilter);
        bindTexture(dye.read.texture, 0, passes.bloomPrefilter.uniforms.u_texture);
        drawTo(bloomPrefilter, bloomWidth, bloomHeight);

        bindPass(passes.bloomBlur);
        bindTexture(bloomPrefilter.texture, 0, passes.bloomBlur.uniforms.u_texture);
        gl.uniform2f(passes.bloomBlur.uniforms.u_texel, 1 / bloomWidth, 1 / bloomHeight);
        gl.uniform2f(passes.bloomBlur.uniforms.u_direction, 1, 0);
        drawTo(bloomBlur, bloomWidth, bloomHeight);

        bindTexture(bloomBlur.texture, 0, passes.bloomBlur.uniforms.u_texture);
        gl.uniform2f(passes.bloomBlur.uniforms.u_direction, 0, 1);
        drawTo(bloomPrefilter, bloomWidth, bloomHeight);
      } else {
        clearSingleFBO(bloomPrefilter);
      }
    }

    function render(time) {
      bindPass(passes.composite);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(baseColor[0], baseColor[1], baseColor[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      bindTexture(dye.read.texture, 0, passes.composite.uniforms.u_dye);
      bindTexture(bloomPrefilter.texture, 1, passes.composite.uniforms.u_bloom);
      gl.uniform2f(passes.composite.uniforms.u_canvas, state.viewportWidth, state.viewportHeight);
      gl.uniform3f(passes.composite.uniforms.u_bg, baseColor[0], baseColor[1], baseColor[2]);
      gl.uniform1f(passes.composite.uniforms.u_time, time * 0.001);
      drawTo(null, canvas.width, canvas.height);
    }

    function update(now, dtMs) {
      if (disposed || visibilityPaused || !viewportActive) {
        return;
      }

      const dt = clamp(dtMs / 16.6667, 0.5, 1.6);
      frameTimes.push(dtMs);
      frameTimeTotal += dtMs;
      if (frameTimes.length > 30) {
        frameTimeTotal -= frameTimes.shift();
      }
      const avg = frameTimeTotal / Math.max(frameTimes.length, 1);
      if (avg > 18.5 && profileIndex < performanceProfiles.length - 1) {
        profileIndex += 1;
        scale = performanceProfiles[profileIndex].scale;
        frameTimes.length = 0;
        frameTimeTotal = 0;
        resizeFramebuffers();
      } else if (avg < 14 && profileIndex > 0) {
        profileIndex -= 1;
        scale = performanceProfiles[profileIndex].scale;
        frameTimes.length = 0;
        frameTimeTotal = 0;
        resizeFramebuffers();
      }

      step(dt, now);
      render(now);
    }

    const onResize = debounce(() => {
      if (disposed) {
        return;
      }
      resizeFramebuffers();
    }, 96);

    function onVisibilityChange() {
      visibilityPaused = doc.hidden;
    }

    intersectionObserver = new IntersectionObserver(
      (entries) => {
        viewportActive = entries.some((entry) => entry.isIntersecting);
      },
      { threshold: 0.01 }
    );
    intersectionObserver.observe(stage);

    function destroy() {
      if (disposed) {
        return;
      }

      disposed = true;
      win.removeEventListener("resize", onResize);
      win.removeEventListener("mousemove", updateMouse);
      doc.removeEventListener("visibilitychange", onVisibilityChange);
      if (intersectionObserver) {
        intersectionObserver.disconnect();
      }
      destroyResources();
      Object.values(passes).forEach((pass) => {
        gl.deleteProgram(pass.program);
      });
      gl.deleteBuffer(quadBuffer);
      stage.remove();
      body.classList.remove("has-webgl-ink");
    }

    win.addEventListener("resize", onResize);
    win.addEventListener("mousemove", updateMouse, { passive: true });
    doc.addEventListener("visibilitychange", onVisibilityChange);
    win.addEventListener("pagehide", destroy, { once: true });

    try {
      resizeFramebuffers();
    } catch (error) {
      destroy();
      return createInkFallback();
    }

    return {
      destroy,
      update,
      resize: onResize,
    };
  }

  function createOpaqueInkFallback() {
    if (reducedMotion || !body.classList.contains("has-gradient-motion")) {
      setInkModeBadge("off");
      return null;
    }

    const inkStage = createInkStage();
    const stage = inkStage.stage;
    const canvas = inkStage.canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      stage.remove();
      setInkModeBadge("off");
      return null;
    }

    const simCanvas = doc.createElement("canvas");
    const simCtx = simCanvas.getContext("2d", { alpha: false });
    if (!simCtx) {
      stage.remove();
      setInkModeBadge("off");
      return null;
    }

    const palette = [
      [242, 196, 206],
      [184, 228, 220],
      [217, 200, 232],
      [245, 230, 192],
      [168, 216, 216],
    ];
    const blobs = Array.from({ length: 7 }, (_, index) => ({
      seed: index * 1.91 + Math.random() * 8,
      anchorX: 0.16 + Math.random() * 0.68,
      anchorY: 0.18 + Math.random() * 0.64,
      radius: 90 + Math.random() * 130,
      color: palette[index % palette.length],
    }));

    let displayDpr = 1;
    let disposed = false;
    let activated = false;

    function activateOnce() {
      if (activated) {
        return;
      }
      activated = true;
      body.classList.add("has-webgl-ink");
      setInkModeBadge("fallback");
    }

    function applyResize() {
      displayDpr = Math.min(win.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(state.viewportWidth * displayDpr));
      canvas.height = Math.max(1, Math.round(state.viewportHeight * displayDpr));
      canvas.style.width = `${state.viewportWidth}px`;
      canvas.style.height = `${state.viewportHeight}px`;
      simCanvas.width = Math.max(1, Math.round(state.viewportWidth * 0.25));
      simCanvas.height = Math.max(1, Math.round(state.viewportHeight * 0.25));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(displayDpr, displayDpr);
      ctx.imageSmoothingEnabled = true;
    }

    const onResize = debounce(applyResize, 96);

    function draw(time) {
      if (disposed) {
        return;
      }

      const width = Math.max(1, state.viewportWidth);
      const height = Math.max(1, state.viewportHeight);
      const scrollMix = state.maxScroll > 0
        ? clamp(state.currentScroll / state.maxScroll, 0, 1)
        : 0;

      ctx.fillStyle = "#dfeffc";
      ctx.fillRect(0, 0, width, height);

      simCtx.globalCompositeOperation = "source-over";
      simCtx.fillStyle = "#dfeffc";
      simCtx.fillRect(0, 0, simCanvas.width, simCanvas.height);
      simCtx.globalCompositeOperation = "source-over";

      blobs.forEach((blob, index) => {
        const x =
          (blob.anchorX + Math.sin(time * 0.00022 + blob.seed) * 0.17) * simCanvas.width;
        const y =
          (blob.anchorY + Math.cos(time * 0.00018 + blob.seed * 1.2) * 0.15) * simCanvas.height;
        const radius =
          blob.radius *
          (0.58 + scrollMix * 0.12 + Math.sin(time * 0.00015 + index * 0.6) * 0.06);
        const gradient = simCtx.createRadialGradient(
          x,
          y,
          radius * 0.12,
          x,
          y,
          radius
        );
        gradient.addColorStop(0, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, 0.72)`);
        gradient.addColorStop(0.52, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, 0.38)`);
        gradient.addColorStop(1, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, 0)`);
        simCtx.fillStyle = gradient;
        simCtx.beginPath();
        simCtx.arc(x, y, radius, 0, Math.PI * 2);
        simCtx.fill();
      });

      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(simCanvas, 0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      activateOnce();
    }

    function destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      win.removeEventListener("resize", onResize);
      stage.remove();
      body.classList.remove("has-webgl-ink");
      setInkModeBadge("off");
    }

    win.addEventListener("resize", onResize);
    applyResize();

    return {
      destroy,
      resize: onResize,
      update(now) {
        draw(now);
      },
    };
  }

  function createOpaqueInkSimulation() {
    if (reducedMotion || !body.classList.contains("has-gradient-motion")) {
      setInkModeBadge("off");
      return null;
    }

    const inkStage = createInkStage();
    const stage = inkStage.stage;
    const canvas = inkStage.canvas;
    const webglContext = getSingleWebGLContext(canvas);
    const gl = webglContext.gl;

    if (!gl) {
      stage.remove();
      return createOpaqueInkFallback();
    }

    const isWebGL2 = webglContext.isWebGL2;
    const halfFloatExt = isWebGL2
      ? gl.getExtension("EXT_color_buffer_float")
      : gl.getExtension("OES_texture_half_float");
    const floatExt = isWebGL2 ? null : gl.getExtension("OES_texture_float");
    const linearFloatExt =
      gl.getExtension("OES_texture_half_float_linear") ||
      gl.getExtension("OES_texture_float_linear");

    if (!halfFloatExt && !floatExt) {
      stage.remove();
      return createOpaqueInkFallback();
    }

    const textureType = isWebGL2
      ? gl.HALF_FLOAT
      : halfFloatExt
        ? halfFloatExt.HALF_FLOAT_OES
        : floatExt.FLOAT;
    const linearFilter = linearFloatExt ? gl.LINEAR : gl.NEAREST;
    const palette = [
      [0.95, 0.77, 0.81],
      [0.72, 0.89, 0.86],
      [0.85, 0.78, 0.91],
      [0.96, 0.90, 0.75],
      [0.66, 0.85, 0.85],
    ];
    const cursorColor = [229 / 255, 198 / 255, 221 / 255];
    const emitters = Array.from({ length: 4 }, (_, index) => ({
      seed: 1.7 + index * 1.93,
      phase: 0.8 + index * 1.27,
      hue: index % palette.length,
    }));

    let disposed = false;
    let contextLost = false;
    let visibilityPaused = false;
    let scale = 0.125;
    let injectionStride = 3;
    let simWidth = 0;
    let simHeight = 0;
    let velocity = null;
    let dye = null;
    let pressure = null;
    let divergence = null;
    let frameCounter = 0;
    let averageFrameTotal = 0;
    const averageFrames = [];
    let pendingCursorSplat = null;
    let lastPointer = { x: 0.5, y: 0.5 };

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const vertexShaderSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const advectShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_velocity;
      uniform sampler2D u_source;
      uniform vec2 u_texel;
      uniform float u_dt;
      uniform float u_dissipation;
      void main() {
        vec2 velocity = texture2D(u_velocity, v_uv).xy;
        vec2 coord = clamp(v_uv - velocity * u_texel * u_dt, 0.001, 0.999);
        vec3 value = texture2D(u_source, coord).rgb * u_dissipation;
        gl_FragColor = vec4(value, 1.0);
      }
    `;

    const divergenceShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_velocity;
      uniform vec2 u_texel;
      void main() {
        float L = texture2D(u_velocity, v_uv - vec2(u_texel.x, 0.0)).x;
        float R = texture2D(u_velocity, v_uv + vec2(u_texel.x, 0.0)).x;
        float B = texture2D(u_velocity, v_uv - vec2(0.0, u_texel.y)).y;
        float T = texture2D(u_velocity, v_uv + vec2(0.0, u_texel.y)).y;
        gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
      }
    `;

    const pressureShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_pressure;
      uniform sampler2D u_divergence;
      uniform vec2 u_texel;
      void main() {
        float L = texture2D(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;
        float R = texture2D(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;
        float B = texture2D(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;
        float T = texture2D(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;
        float D = texture2D(u_divergence, v_uv).x;
        gl_FragColor = vec4((L + R + B + T - D) * 0.25, 0.0, 0.0, 1.0);
      }
    `;

    const gradientSubtractShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_pressure;
      uniform sampler2D u_velocity;
      uniform vec2 u_texel;
      void main() {
        float L = texture2D(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;
        float R = texture2D(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;
        float B = texture2D(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;
        float T = texture2D(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;
        vec2 velocity = texture2D(u_velocity, v_uv).xy;
        velocity -= 0.5 * vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
    `;

    const splatShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_target;
      uniform vec2 u_point;
      uniform vec3 u_color;
      uniform float u_radius;
      uniform float u_aspect;
      void main() {
        vec2 delta = v_uv - u_point;
        delta.x *= u_aspect;
        float dist = length(delta);
        float influence = 1.0 - smoothstep(0.0, u_radius, dist);
        influence *= influence;
        vec3 base = texture2D(u_target, v_uv).rgb;
        gl_FragColor = vec4(base + u_color * influence, 1.0);
      }
    `;

    const compositeShaderSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_dye;
      void main() {
        vec3 base = vec3(0.875, 0.937, 0.988);
        vec3 dye = texture2D(u_dye, v_uv).rgb;
        float strength = smoothstep(0.005, 0.55, length(dye));
        vec3 washed = base * (1.0 + dye * 1.45);
        vec3 result = mix(base, washed, strength * 0.92);
        result = mix(result, dye, strength * 0.28);
        float grain = fract(sin(dot(v_uv * 800.0, vec2(12.9898, 78.233))) * 43758.5453) * 0.04;
        result += grain - 0.02;
        gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
      }
    `;

    function createShader(type, source) {
      const shader = gl.createShader(type);
      if (!shader) {
        return null;
      }
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    function createProgram(fragmentSource) {
      const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
      if (!vertexShader || !fragmentShader) {
        return null;
      }
      const program = gl.createProgram();
      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return null;
      }
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        return null;
      }
      return {
        program,
        position: gl.getAttribLocation(program, "a_position"),
        uniforms: {},
      };
    }

    const passes = {
      advect: createProgram(advectShaderSource),
      divergence: createProgram(divergenceShaderSource),
      pressure: createProgram(pressureShaderSource),
      gradientSubtract: createProgram(gradientSubtractShaderSource),
      splat: createProgram(splatShaderSource),
      composite: createProgram(compositeShaderSource),
    };

    if (Object.values(passes).some((pass) => !pass)) {
      stage.remove();
      return createOpaqueInkFallback();
    }

    function cacheUniforms(pass, names) {
      names.forEach((name) => {
        pass.uniforms[name] = gl.getUniformLocation(pass.program, name);
      });
    }

    cacheUniforms(passes.advect, ["u_velocity", "u_source", "u_texel", "u_dt", "u_dissipation"]);
    cacheUniforms(passes.divergence, ["u_velocity", "u_texel"]);
    cacheUniforms(passes.pressure, ["u_pressure", "u_divergence", "u_texel"]);
    cacheUniforms(passes.gradientSubtract, ["u_pressure", "u_velocity", "u_texel"]);
    cacheUniforms(passes.splat, ["u_target", "u_point", "u_color", "u_radius", "u_aspect"]);
    cacheUniforms(passes.composite, ["u_dye"]);

    function bindPass(pass) {
      gl.useProgram(pass.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(pass.position);
      gl.vertexAttribPointer(pass.position, 2, gl.FLOAT, false, 0, 0);
    }

    function bindTexture(texture, unit, uniform) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform, unit);
    }

    function createTexture(width, height, filter) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (isWebGL2) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, textureType, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, textureType, null);
      }
      return texture;
    }

    function createFBO(width, height, filter) {
      const texture = createTexture(width, height, filter);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      return { texture, framebuffer, width, height };
    }

    function createDoubleFBO(width, height, filter) {
      let read = createFBO(width, height, filter);
      let write = createFBO(width, height, filter);
      return {
        get read() {
          return read;
        },
        get write() {
          return write;
        },
        swap() {
          const previous = read;
          read = write;
          write = previous;
        },
      };
    }

    function isFramebufferComplete(target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }

    function clearTarget(target, r, g, b) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.clearColor(r, g, b, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    function destroyFBO(target) {
      if (!target) {
        return;
      }
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
    }

    function destroyDoubleFBO(target) {
      if (!target) {
        return;
      }
      destroyFBO(target.read);
      destroyFBO(target.write);
    }

    function destroyResources() {
      destroyDoubleFBO(velocity);
      destroyDoubleFBO(dye);
      destroyDoubleFBO(pressure);
      destroyFBO(divergence);
      velocity = null;
      dye = null;
      pressure = null;
      divergence = null;
    }

    function resizeFramebuffers() {
      const nextWidth = Math.max(1, Math.round(state.viewportWidth * scale));
      const nextHeight = Math.max(1, Math.round(state.viewportHeight * scale));
      if (nextWidth === simWidth && nextHeight === simHeight && dye) {
        return;
      }

      destroyResources();
      simWidth = nextWidth;
      simHeight = nextHeight;
      velocity = createDoubleFBO(simWidth, simHeight, linearFilter);
      dye = createDoubleFBO(simWidth, simHeight, linearFilter);
      pressure = createDoubleFBO(simWidth, simHeight, gl.NEAREST);
      divergence = createFBO(simWidth, simHeight, gl.NEAREST);

      const valid = [
        velocity.read,
        velocity.write,
        dye.read,
        dye.write,
        pressure.read,
        pressure.write,
        divergence,
      ].every(isFramebufferComplete);
      if (!valid) {
        throw new Error("Opaque ink framebuffers are incomplete");
      }

      const displayDpr = Math.min(win.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(state.viewportWidth * displayDpr));
      canvas.height = Math.max(1, Math.round(state.viewportHeight * displayDpr));
      canvas.style.width = `${state.viewportWidth}px`;
      canvas.style.height = `${state.viewportHeight}px`;

      clearTarget(velocity.read, 0, 0, 0);
      clearTarget(velocity.write, 0, 0, 0);
      clearTarget(dye.read, 0, 0, 0);
      clearTarget(dye.write, 0, 0, 0);
      clearTarget(pressure.read, 0, 0, 0);
      clearTarget(pressure.write, 0, 0, 0);
      clearTarget(divergence, 0, 0, 0);
      seedInitialInk();
    }

    function drawTo(target, width, height) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.viewport(0, 0, width, height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function advectField(sourceField, velocityField, dissipation) {
      bindPass(passes.advect);
      bindTexture(velocityField.read.texture, 0, passes.advect.uniforms.u_velocity);
      bindTexture(sourceField.read.texture, 1, passes.advect.uniforms.u_source);
      gl.uniform2f(passes.advect.uniforms.u_texel, 1 / simWidth, 1 / simHeight);
      gl.uniform1f(passes.advect.uniforms.u_dt, 0.016);
      gl.uniform1f(passes.advect.uniforms.u_dissipation, dissipation);
      drawTo(sourceField.write, simWidth, simHeight);
      sourceField.swap();
    }

    function applySplat(targetField, pointX, pointY, color, radiusPx) {
      bindPass(passes.splat);
      bindTexture(targetField.read.texture, 0, passes.splat.uniforms.u_target);
      gl.uniform2f(passes.splat.uniforms.u_point, pointX, pointY);
      gl.uniform3f(passes.splat.uniforms.u_color, color[0], color[1], color[2]);
      gl.uniform1f(passes.splat.uniforms.u_radius, radiusPx / Math.max(simHeight, 1));
      gl.uniform1f(passes.splat.uniforms.u_aspect, simWidth / Math.max(simHeight, 1));
      drawTo(targetField.write, simWidth, simHeight);
      targetField.swap();
    }

    function solvePressure(iterations) {
      bindPass(passes.divergence);
      bindTexture(velocity.read.texture, 0, passes.divergence.uniforms.u_velocity);
      gl.uniform2f(passes.divergence.uniforms.u_texel, 1 / simWidth, 1 / simHeight);
      drawTo(divergence, simWidth, simHeight);

      clearTarget(pressure.read, 0, 0, 0);
      clearTarget(pressure.write, 0, 0, 0);

      bindPass(passes.pressure);
      bindTexture(divergence.texture, 1, passes.pressure.uniforms.u_divergence);
      gl.uniform2f(passes.pressure.uniforms.u_texel, 1 / simWidth, 1 / simHeight);
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        bindTexture(pressure.read.texture, 0, passes.pressure.uniforms.u_pressure);
        drawTo(pressure.write, simWidth, simHeight);
        pressure.swap();
      }

      bindPass(passes.gradientSubtract);
      bindTexture(pressure.read.texture, 0, passes.gradientSubtract.uniforms.u_pressure);
      bindTexture(velocity.read.texture, 1, passes.gradientSubtract.uniforms.u_velocity);
      gl.uniform2f(passes.gradientSubtract.uniforms.u_texel, 1 / simWidth, 1 / simHeight);
      drawTo(velocity.write, simWidth, simHeight);
      velocity.swap();
    }

    function injectAmbientSplats(time, scrollMix) {
      if (frameCounter % injectionStride !== 0) {
        return;
      }

      const splatCount = frameCounter % (injectionStride * 2) === 0 ? 2 : 1;
      const baseRadius = mix(62, 38, scrollMix);
      for (let index = 0; index < splatCount; index += 1) {
        const emitter = emitters[(frameCounter + index) % emitters.length];
        const x = clamp(
          0.5 +
          Math.sin(time * 0.0004 + emitter.seed) * 0.3 +
          Math.sin(time * 0.00017 + emitter.phase) * 0.08,
          0.08,
          0.92
        );
        const y = clamp(
          0.5 +
          Math.cos(time * 0.0003 + emitter.phase) * 0.2 +
          Math.sin(time * 0.00021 + emitter.seed) * 0.06,
          0.08,
          0.92
        );
        const radius = Math.max(28, baseRadius + Math.sin(time * 0.0001 + index) * 10);
        const velocityX = Math.sin(time * 0.00037 + emitter.seed) * 1.2;
        const velocityY = Math.cos(time * 0.00028 + emitter.phase) * 1.2;
        applySplat(dye, x, y, palette[(emitter.hue + index) % palette.length], radius);
        applySplat(velocity, x, y, [velocityX, velocityY, 0.0], radius * 0.8);
      }
    }

    function seedInitialInk() {
      for (let index = 0; index < emitters.length + 3; index += 1) {
        const emitter = emitters[index % emitters.length];
        const x = 0.14 + ((index * 0.17) % 0.72);
        const y = 0.18 + (((index * 0.21) + 0.09) % 0.58);
        const radius = 38 + index * 10;
        const color = palette[(emitter.hue + index) % palette.length];
        applySplat(dye, x, y, color, radius);
        applySplat(
          velocity,
          x,
          y,
          [
            Math.sin(index * 1.7) * 1.2,
            Math.cos(index * 1.3) * 1.2,
            0.0,
          ],
          radius * 0.85
        );
      }
    }

    const updateMouse = throttleInterval((event) => {
      const x = clamp(event.clientX / Math.max(state.viewportWidth, 1), 0.02, 0.98);
      const y = clamp(1 - event.clientY / Math.max(state.viewportHeight, 1), 0.02, 0.98);
      const dx = x - lastPointer.x;
      const dy = y - lastPointer.y;
      const mouseSpeed = Math.hypot(dx * state.viewportWidth, dy * state.viewportHeight);
      const impulseMagnitude = clamp(mouseSpeed * 0.15, 0, 8);
      const directionLength = Math.hypot(dx, dy) || 1;
      pendingCursorSplat = {
        x,
        y,
        impulse: {
          x: (dx / directionLength) * impulseMagnitude,
          y: (dy / directionLength) * impulseMagnitude,
        },
      };
      lastPointer.x = x;
      lastPointer.y = y;
    }, 32);

    function flushCursorSplat(scrollMix) {
      if (!pendingCursorSplat) {
        return;
      }
      const radius = mix(50, 30, scrollMix) * 0.75;
      applySplat(dye, pendingCursorSplat.x, pendingCursorSplat.y, cursorColor, radius);
      applySplat(
        velocity,
        pendingCursorSplat.x,
        pendingCursorSplat.y,
        [pendingCursorSplat.impulse.x, pendingCursorSplat.impulse.y, 0.0],
        radius * 0.9
      );
      pendingCursorSplat = null;
    }

    function renderComposite() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.875, 0.937, 0.988, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      bindPass(passes.composite);
      bindTexture(dye.read.texture, 0, passes.composite.uniforms.u_dye);
      drawTo(null, canvas.width, canvas.height);
    }

    const onResize = debounce(() => {
      if (!disposed) {
        resizeFramebuffers();
      }
    }, 96);

    function onVisibilityChange() {
      visibilityPaused = doc.hidden;
    }

    function onContextLost(event) {
      event.preventDefault();
      contextLost = true;
    }

    function onContextRestored() {
      contextLost = true;
    }

    function destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      win.removeEventListener("resize", onResize);
      win.removeEventListener("mousemove", updateMouse);
      doc.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      destroyResources();
      Object.values(passes).forEach((pass) => {
        gl.deleteProgram(pass.program);
      });
      gl.deleteBuffer(quadBuffer);
      stage.remove();
      body.classList.remove("has-webgl-ink");
      setInkModeBadge("off");
    }

    win.addEventListener("resize", onResize);
    win.addEventListener("mousemove", updateMouse, { passive: true });
    doc.addEventListener("visibilitychange", onVisibilityChange);
    canvas.addEventListener("webglcontextlost", onContextLost, false);
    canvas.addEventListener("webglcontextrestored", onContextRestored, false);
    win.addEventListener("pagehide", destroy, { once: true });

    try {
      resizeFramebuffers();
      body.classList.add("has-webgl-ink");
      setInkModeBadge("webgl");
    } catch (error) {
      destroy();
      return createOpaqueInkFallback();
    }

    return {
      destroy,
      resize: onResize,
      update(now, dtMs) {
        if (disposed || visibilityPaused) {
          return;
        }
        if (contextLost) {
          throw new Error("Opaque ink context lost");
        }

        averageFrames.push(dtMs);
        averageFrameTotal += dtMs;
        if (averageFrames.length > 30) {
          averageFrameTotal -= averageFrames.shift();
        }

        const averageFrame = averageFrameTotal / Math.max(averageFrames.length, 1);
        const nextScale = averageFrame > 22 ? 0.0625 : 0.125;
        const nextStride = averageFrame > 22 ? 6 : 3;
        if (nextScale !== scale) {
          scale = nextScale;
          injectionStride = nextStride;
          resizeFramebuffers();
        } else {
          injectionStride = nextStride;
        }

        frameCounter += 1;
        const scrollMix = state.maxScroll > 0
          ? clamp(state.currentScroll / state.maxScroll, 0, 1)
          : 0;
        const velocityDissipation = 0.992;
        const dyeDissipation = mix(0.997, 0.985, scrollMix);

        advectField(velocity, velocity, velocityDissipation);
        solvePressure(12);
        advectField(dye, velocity, dyeDissipation);
        injectAmbientSplats(now, scrollMix);
        flushCursorSplat(scrollMix);
        renderComposite();
      },
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function lerp(current, target, factor) {
    return current + (target - current) * factor;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function getEffectCadence(effectName, activeScroll) {
    const performanceMode = state.performanceMode || "high";

    if (performanceMode === "low") {
      if (effectName === "depth") {
        return 4;
      }
      if (effectName === "constellation") {
        return 3;
      }
      return 2;
    }

    if (performanceMode === "medium") {
      if (effectName === "depth" || effectName === "constellation") {
        return activeScroll ? 3 : 2;
      }
      if (effectName === "weather") {
        return activeScroll ? 2 : 1;
      }
      return activeScroll ? 2 : 1;
    }

    if (activeScroll && (effectName === "depth" || effectName === "constellation")) {
      return 2;
    }

    return 1;
  }

  function shouldRunEffect(effectName, activeScroll) {
    const cadence = getEffectCadence(effectName, activeScroll);
    return cadence <= 1 || state.frameIndex % cadence === 0;
  }

  function getEffectDelta(effectName, now, fallbackDelta) {
    const lastRunAt = state.effectLastRunAt[effectName];
    state.effectLastRunAt[effectName] = now;
    if (!lastRunAt) {
      return fallbackDelta;
    }
    return Math.max(fallbackDelta, Math.min(now - lastRunAt, 80));
  }

  function updateViewport() {
    state.viewportWidth = win.innerWidth;
    state.viewportHeight = win.innerHeight;
    state.maxScroll = Math.max(0, body.scrollHeight - state.viewportHeight);
    syncShellHeight();
    if (state.depthScene && state.depthScene.resizeCanvases) {
      state.depthScene.resizeCanvases();
    }
    if (state.sectionBleeds && state.sectionBleeds.rebuild) {
      state.sectionBleeds.rebuild();
    }
    if (state.narrativeThread && state.narrativeThread.refreshLayout) {
      state.narrativeThread.refreshLayout();
    }
    if (state.storyWeather && state.storyWeather.refresh) {
      state.storyWeather.refresh();
    }
    scheduleLayoutRefresh();
  }

  function syncShellHeight() {
    if (!siteShell) {
      return;
    }

    if (!isTouch && !reducedMotion) {
      const height = siteShell.getBoundingClientRect().height;
      body.style.height = `${Math.ceil(height)}px`;
      state.maxScroll = Math.max(0, height - state.viewportHeight);
    } else {
      body.style.height = "";
      siteShell.style.transform = "";
      siteShell.style.position = "";
      siteShell.style.top = "";
      siteShell.style.left = "";
      siteShell.style.right = "";
      siteShell.style.width = "";
    }
  }

  function setupSmoothScroll() {
    if (!siteShell || isTouch || reducedMotion) {
      return;
    }

    siteShell.style.position = "fixed";
    siteShell.style.top = "0";
    siteShell.style.left = "0";
    siteShell.style.right = "0";
    siteShell.style.width = "100%";
    siteShell.style.willChange = "transform";

    syncShellHeight();

    win.addEventListener("wheel", () => {
      traceInteraction("interaction:wheel", () => {
        state.lastWheelAt = performance.now();
        state.lastScrollInputAt = state.lastWheelAt;
      });
    }, { passive: true });

    win.addEventListener("scroll", () => {
      state.targetScroll = clamp(win.scrollY, 0, state.maxScroll);
    }, { passive: true });

    win.addEventListener("keydown", (event) => {
      const target = event.target;
      const isTypingField =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (isTypingField) {
        return;
      }

      const pageStep = Math.max(320, state.viewportHeight * 0.85);
      let nextScroll = null;

      if (event.key === "ArrowDown") {
        nextScroll = clamp(win.scrollY + 90, 0, state.maxScroll);
      } else if (event.key === "ArrowUp") {
        nextScroll = clamp(win.scrollY - 90, 0, state.maxScroll);
      } else if (event.key === "PageDown" || event.key === " ") {
        nextScroll = clamp(win.scrollY + pageStep, 0, state.maxScroll);
      } else if (event.key === "PageUp") {
        nextScroll = clamp(win.scrollY - pageStep, 0, state.maxScroll);
      } else if (event.key === "Home") {
        nextScroll = 0;
      } else if (event.key === "End") {
        nextScroll = state.maxScroll;
      }

      if (nextScroll !== null) {
        state.targetScroll = nextScroll;
        state.lastScrollInputAt = performance.now();
        deferTask(() => win.scrollTo({ top: nextScroll, behavior: "auto" }));
      }
    });

    win.addEventListener("resize", debounce(updateViewport, 96));
  }

  function setupCustomCursor() {
    if (isTouch || reducedMotion) {
      return;
    }

    const cursor = doc.createElement("div");
    cursor.className = "cursor-shell";
    cursor.innerHTML = '<div class="cursor-ring"></div><div class="cursor-dot"></div>';
    body.appendChild(cursor);

    const dot = cursor.querySelector(".cursor-dot");
    const ring = cursor.querySelector(".cursor-ring");

    win.addEventListener("mousemove", (event) => {
      state.mouseX = event.clientX;
      state.mouseY = event.clientY;
      state.cursorVisible = true;
      cursor.classList.add("is-visible");
    }, { passive: true });

    win.addEventListener("mouseleave", () => {
      state.cursorVisible = false;
      cursor.classList.remove("is-visible");
    }, { passive: true });

    doc.querySelectorAll(interactiveSelector).forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      interactiveElements.push(element);
      element.classList.add("motion-interactive");
      rememberElement(element);

      element.addEventListener("mouseenter", () => cursor.classList.add("is-hovering"));
      element.addEventListener("mouseleave", () => cursor.classList.remove("is-hovering"));
    });

    function updateCursor() {
      const performanceMode = state.performanceMode || "high";
      if (performanceMode === "low") {
        state.cursorX = state.mouseX;
        state.cursorY = state.mouseY;
      } else {
        const cursorLerp = performanceMode === "medium" ? 0.34 : 0.44;
        state.cursorX = lerp(state.cursorX, state.mouseX, cursorLerp);
        state.cursorY = lerp(state.cursorY, state.mouseY, cursorLerp);
      }

      const translate = `translate3d(${state.cursorX}px, ${state.cursorY}px, 0)`;
      dot.style.transform = `${translate} translate3d(-50%, -50%, 0)`;
      ring.style.transform = `${translate} translate3d(-50%, -50%, 0)`;
    }

    state.updateCursor = updateCursor;
  }

  function setupMagneticHover() {
    if (isTouch || reducedMotion) {
      return;
    }

    doc.querySelectorAll(".button, .feature-link, .contact-row, .page-link-row, .site-nav a, .brand").forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      const glow = doc.createElement("span");
      glow.className = "magnetic-glow";
      element.classList.add("magnetic-item");
      element.appendChild(glow);

      const model = {
        element,
        glow,
        targetX: 0,
        targetY: 0,
        currentX: 0,
        currentY: 0,
        velocityX: 0,
        velocityY: 0,
        hover: false,
        scale: 1,
        radius: 120,
      };

      magneticElements.push(model);
      rememberElement(element);

      element.addEventListener("mouseenter", () => {
        model.hover = true;
        element.classList.add("is-magnetic-hover");
      });

      element.addEventListener("mouseleave", () => {
        model.hover = false;
        model.targetX = 0;
        model.targetY = 0;
        element.classList.remove("is-magnetic-hover");
      });
    });
  }

  function updateMagnetic() {
    magneticElements.forEach((item) => {
      const rect = getViewportMetrics(item.element, false);
      if (!rect) {
        return;
      }
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = state.mouseX - centerX;
      const dy = state.mouseY - centerY;
      const distance = Math.hypot(dx, dy);

      if (distance <= item.radius) {
        const strength = 1 - distance / item.radius;
        item.targetX = clamp(dx * 0.16 * strength, -8, 8);
        item.targetY = clamp(dy * 0.16 * strength, -8, 8);
        item.hover = true;
        item.element.classList.add("is-magnetic-hover");
        item.glow.style.setProperty("--glow-x", `${state.mouseX - rect.left}px`);
        item.glow.style.setProperty("--glow-y", `${state.mouseY - rect.top}px`);
      } else {
        item.targetX = 0;
        item.targetY = 0;
        item.hover = false;
        item.element.classList.remove("is-magnetic-hover");
      }

      const spring = 120 / 1000;
      const damping = 14 / 100;

      item.velocityX += (item.targetX - item.currentX) * spring;
      item.velocityY += (item.targetY - item.currentY) * spring;
      item.velocityX *= 1 - damping;
      item.velocityY *= 1 - damping;
      item.currentX += item.velocityX;
      item.currentY += item.velocityY;

      const nextScale = item.hover ? 1.04 : 1;
      item.scale = lerp(item.scale, nextScale, 0.18);

      item.element.style.transform = `translate3d(${item.currentX}px, ${item.currentY}px, 0) scale(${item.scale})`;
      item.glow.style.opacity = item.hover ? "0.2" : "0";
    });
  }

  function setupButtonMicroInteractions() {
    doc.querySelectorAll(".button").forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }

      button.classList.add("micro-button");

      button.addEventListener("pointerdown", (event) => {
        const clientX = event.clientX;
        const clientY = event.clientY;
        traceInteraction("interaction:button-pointerdown", () => {
          deferTask(() => {
            const rect = getViewportMetrics(button);
            if (!rect) {
              return;
            }
            const ripple = doc.createElement("span");
            ripple.className = "button-ripple";
            ripple.style.left = `${clientX - rect.left}px`;
            ripple.style.top = `${clientY - rect.top}px`;
            button.appendChild(ripple);

            win.setTimeout(() => ripple.remove(), 420);
          });
        });
      });
    });
  }

  function setupParallax() {
    if (reducedMotion || isTouch) {
      return;
    }

    doc.querySelectorAll(".hero, .subpage-hero").forEach((section) => {
      if (!(section instanceof HTMLElement)) {
        return;
      }

      section.classList.add("parallax-scene");

      const layers = [];
      const background = section.querySelector(".grain-overlay");
      const midLayers = section.querySelectorAll(".orb, .mountains");
      const foreground = section.querySelector(".hero-illustration, .mini-illustration svg");

      if (background instanceof HTMLElement) {
        background.classList.add("parallax-layer", "parallax-far");
        layers.push({ element: background, speed: 0.2, depth: 0.18, currentX: 0, currentY: 0, z: -200 });
      }

      midLayers.forEach((layer) => {
        if (layer instanceof SVGElement) {
          layer.classList.add("parallax-layer", "parallax-mid");
          layers.push({ element: layer, speed: 0.5, depth: 0.5, currentX: 0, currentY: 0, z: -80 });
        }
      });

      if (foreground instanceof HTMLElement || foreground instanceof SVGElement) {
        foreground.classList.add("parallax-layer", "parallax-fore");
        layers.push({ element: foreground, speed: 1, depth: 1, currentX: 0, currentY: 0, z: 60 });
      }

      parallaxSections.push({
        section,
        layers,
        rotateX: 0,
        rotateY: 0,
        tiltX: 0,
        tiltY: 0,
      });
      rememberElement(section);
      layers.forEach((layer) => rememberElement(layer.element));
    });
  }

  function updateParallax(scrollValue) {
    if (reducedMotion) {
      return;
    }

    parallaxSections.forEach((scene) => {
      const rect = getViewportMetrics(scene.section, false);
      if (!rect) {
        return;
      }
      const relativeX = clamp(((state.mouseX - rect.left) / Math.max(rect.width, 1)) * 2 - 1, -1, 1);
      const relativeY = clamp(((state.mouseY - rect.top) / Math.max(rect.height, 1)) * 2 - 1, -1, 1);
      scene.tiltY = relativeX * 6;
      scene.tiltX = -relativeY * 6;
      scene.rotateX = lerp(scene.rotateX, scene.tiltX, 0.08);
      scene.rotateY = lerp(scene.rotateY, scene.tiltY, 0.08);

      scene.section.style.transform = `translateZ(0px) rotateX(${scene.rotateX}deg) rotateY(${scene.rotateY}deg)`;

      scene.layers.forEach((layer) => {
        const scrollShift = clamp(-rect.top * 0.04 * layer.speed, -12, 12);
        const cursorShiftX = clamp(relativeX * 12 * layer.depth, -12, 12);
        const cursorShiftY = clamp(relativeY * 12 * layer.depth, -12, 12);
        layer.currentX = lerp(layer.currentX, cursorShiftX, 0.12);
        layer.currentY = lerp(layer.currentY, cursorShiftY + scrollShift, 0.12);
        const morphTransform = layer.element.dataset.morphTransform ? ` ${layer.element.dataset.morphTransform}` : "";
        const depthScale = 1 - layer.z / 1200;
        layer.element.style.transform = `translate3d(${layer.currentX}px, ${layer.currentY}px, 0) translateZ(${layer.z}px) scale(${depthScale.toFixed(3)})${morphTransform}`;
      });
    });
  }

  function setupSectionBleeds() {
    if (reducedMotion || !siteShell) {
      return;
    }

    if (state.sectionBleeds && state.sectionBleeds.destroy) {
      state.sectionBleeds.destroy();
    }

    const main = siteShell.querySelector("main");
    if (!(main instanceof HTMLElement)) {
      return;
    }

    const sectionNodes = Array.from(main.children).filter((element) => element instanceof HTMLElement);
    if (sectionNodes.length < 2) {
      return;
    }

    const colorTokens = {
      hero: [242, 196, 206],
      features: [184, 228, 220],
      detail: [184, 228, 220],
      quote: [217, 200, 232],
      contact: [245, 230, 192],
      page: [168, 216, 216],
    };
    const bleedHeight = 280;
    const bleedStates = [];
    let disposed = false;
    let observer = null;
    let idleHandles = [];

    const layer = doc.createElement("div");
    layer.className = "section-bleeds";
    siteShell.insertBefore(layer, siteShell.firstChild);

    const getSectionRole = (section) => {
      if (!(section instanceof HTMLElement)) {
        return "page";
      }
      if (section.matches(".hero, .subpage-hero")) {
        return "hero";
      }
      if (section.matches(".features")) {
        return "features";
      }
      if (section.matches(".detail-section")) {
        return "detail";
      }
      if (section.matches(".quote-band")) {
        return "quote";
      }
      if (section.matches(".contact")) {
        return "contact";
      }
      return "page";
    };

    const getBoundaryColorPair = (upperSection, lowerSection) => {
      const upperRole = getSectionRole(upperSection);
      const lowerRole = getSectionRole(lowerSection);
      return [
        colorTokens[upperRole] || colorTokens.page,
        colorTokens[lowerRole] || colorTokens.page,
      ];
    };

    const collectBoundaries = () => {
      const boundaries = [];
      for (let index = 0; index < sectionNodes.length - 1; index += 1) {
        const upper = sectionNodes[index];
        const lower = sectionNodes[index + 1];
        const upperRect = upper.getBoundingClientRect();
        const lowerRect = lower.getBoundingClientRect();
        const upperBottom = upperRect.bottom + state.currentScroll;
        const lowerTop = lowerRect.top + state.currentScroll;
        const rule = lower.querySelector(".section-rule");
        let centerY = (upperBottom + lowerTop) * 0.5;

        if (rule instanceof HTMLElement) {
          const ruleRect = rule.getBoundingClientRect();
          centerY = ruleRect.top + state.currentScroll + ruleRect.height * 0.5;
        } else if (lower.classList.contains("quote-band")) {
          centerY = lowerTop;
        } else if (upper.classList.contains("quote-band")) {
          centerY = upperBottom;
        }

        boundaries.push({
          id: `${upper.className}->${lower.className}-${index}`,
          upper,
          lower,
          centerY,
          colors: getBoundaryColorPair(upper, lower),
        });
      }
      return boundaries;
    };

    const boundaries = collectBoundaries();
    if (!boundaries.length) {
      layer.remove();
      return;
    }

    const setLayerHeight = () => {
      const shellHeight = Math.max(siteShell.scrollHeight, siteShell.getBoundingClientRect().height);
      layer.style.height = `${Math.ceil(shellHeight)}px`;
    };

    const createIntensityBuffer = (width, height) => new Uint8ClampedArray(width * height);

    const depositSoftCircle = (buffer, width, height, centerX, centerY, radius, amount) => {
      const minX = Math.max(0, Math.floor(centerX - radius));
      const maxX = Math.min(width - 1, Math.ceil(centerX + radius));
      const minY = Math.max(0, Math.floor(centerY - radius));
      const maxY = Math.min(height - 1, Math.ceil(centerY + radius));
      const radiusSq = radius * radius;

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const dx = x - centerX;
          const dy = y - centerY;
          const distSq = dx * dx + dy * dy;
          if (distSq > radiusSq) {
            continue;
          }
          const influence = 1 - distSq / Math.max(radiusSq, 1);
          const nextValue = buffer[y * width + x] + amount * influence * influence;
          buffer[y * width + x] = Math.max(0, Math.min(255, Math.round(nextValue)));
        }
      }
    };

    const createCanvas = (width, height) => {
      const canvas = doc.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    };

    const blurAlphaCanvas = (sourceCanvas, width, height) => {
      const passA = createCanvas(width, height);
      const passB = createCanvas(width, height);
      const passACtx = passA.getContext("2d");
      const passBCtx = passB.getContext("2d");
      if (!passACtx || !passBCtx) {
        return sourceCanvas;
      }

      passACtx.clearRect(0, 0, width, height);
      passACtx.filter = "blur(12px)";
      passACtx.drawImage(sourceCanvas, 0, 0);
      passACtx.filter = "none";

      passBCtx.clearRect(0, 0, width, height);
      passBCtx.filter = "blur(12px)";
      passBCtx.drawImage(passA, 0, 0);
      passBCtx.filter = "none";
      return passB;
    };

    const buildAlphaMap = (buffer, width, height) => {
      const alphaCanvas = createCanvas(width, height);
      const alphaCtx = alphaCanvas.getContext("2d");
      if (!alphaCtx) {
        return { alphaCanvas, alphaData: null };
      }

      const image = alphaCtx.createImageData(width, height);
      for (let index = 0; index < buffer.length; index += 1) {
        image.data[index * 4 + 3] = buffer[index];
      }
      alphaCtx.putImageData(image, 0, 0);
      const blurred = blurAlphaCanvas(alphaCanvas, width, height);
      const blurredCtx = blurred.getContext("2d");
      if (!blurredCtx) {
        return { alphaCanvas: blurred, alphaData: null };
      }

      const blurredImage = blurredCtx.getImageData(0, 0, width, height);
      const alphaData = new Uint8ClampedArray(width * height);
      const centerY = height * 0.5;
      const sigma = 60;
      for (let y = 0; y < height; y += 1) {
        const gaussian = Math.exp(-Math.pow(y - centerY, 2) / (2 * sigma * sigma));
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          const alpha = blurredImage.data[index * 4 + 3];
          alphaData[index] = Math.round(alpha * gaussian);
        }
      }
      return { alphaCanvas: blurred, alphaData };
    };

    const buildEdgePoints = (alphaData, width, height) => {
      const points = [];
      if (!alphaData) {
        return points;
      }

      for (let y = 6; y < height - 6; y += 4) {
        for (let x = 6; x < width - 6; x += 5) {
          const index = y * width + x;
          const alpha = alphaData[index];
          if (alpha < 22) {
            continue;
          }
          if (
            alphaData[index - 1] < 18 ||
            alphaData[index + 1] < 18 ||
            alphaData[index - width] < 18 ||
            alphaData[index + width] < 18
          ) {
            points.push({ x, y });
          }
        }
      }

      return points;
    };

    const buildTendrils = (edgePoints, colors, random) => {
      if (!edgePoints.length) {
        return [];
      }

      const tendrils = [];
      const tendrilCount = 8 + Math.floor(random() * 8);
      for (let index = 0; index < tendrilCount; index += 1) {
        const start = edgePoints[Math.floor(random() * edgePoints.length)];
        if (!start) {
          continue;
        }
        const outward = start.y < bleedHeight * 0.5 ? -1 : 1;
        const length = 40 + random() * 80;
        const endX = start.x + (random() * 2 - 1) * 70;
        const endY = start.y + outward * length;
        tendrils.push({
          startX: start.x,
          startY: start.y,
          cp1X: start.x + (random() * 2 - 1) * 24,
          cp1Y: start.y + outward * (14 + random() * 24),
          cp2X: endX + (random() * 2 - 1) * 28,
          cp2Y: start.y + outward * (28 + random() * 40),
          endX,
          endY,
          width: 1 + random() * 2,
          color: start.y < bleedHeight * 0.5 ? colors[0] : colors[1],
          layerIndex: Math.min(4, Math.floor(random() * 5)),
        });
      }
      return tendrils;
    };

    const colorizeAlpha = (alphaData, width, height, colors, seedKey) => {
      const image = new ImageData(width, height);
      const upperColor = colors[0];
      const lowerColor = colors[1];

      for (let y = 0; y < height; y += 1) {
        const blendBase = smoothstep(0.15, 0.85, y / Math.max(height - 1, 1));
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          const alpha = alphaData[index];
          if (alpha <= 1) {
            continue;
          }

          const noise = noise2D(x * 0.018 + seedKey, y * 0.024 + seedKey * 0.37);
          const blend = clamp(blendBase + (noise - 0.5) * 0.28, 0, 1);
          const pixelIndex = index * 4;
          image.data[pixelIndex] = Math.round(mix(upperColor[0], lowerColor[0], blend));
          image.data[pixelIndex + 1] = Math.round(mix(upperColor[1], lowerColor[1], blend));
          image.data[pixelIndex + 2] = Math.round(mix(upperColor[2], lowerColor[2], blend));
          image.data[pixelIndex + 3] = Math.round(alpha * 0.82);
        }
      }

      const floorBand = 7;
      for (let x = 0; x < width; x += 1) {
        let lowestY = -1;
        for (let y = height - 1; y >= 0; y -= 1) {
          if (alphaData[y * width + x] > 26) {
            lowestY = y;
            break;
          }
        }
        if (lowestY < 0) {
          continue;
        }
        for (let offset = 0; offset < floorBand; offset += 1) {
          const y = Math.min(height - 1, lowestY + offset);
          const pixelIndex = (y * width + x) * 4;
          image.data[pixelIndex] = Math.round(image.data[pixelIndex] * 0.8);
          image.data[pixelIndex + 1] = Math.round(image.data[pixelIndex + 1] * 0.8);
          image.data[pixelIndex + 2] = Math.round(image.data[pixelIndex + 2] * 0.8);
          image.data[pixelIndex + 3] = Math.min(255, image.data[pixelIndex + 3] + 26);
        }
      }

      return image;
    };

    const drawTendrils = (ctx, tendrils, layerIndex) => {
      tendrils.forEach((tendril) => {
        if (tendril.layerIndex > layerIndex) {
          return;
        }
        const gradient = ctx.createLinearGradient(
          tendril.startX,
          tendril.startY,
          tendril.endX,
          tendril.endY
        );
        gradient.addColorStop(0, `rgba(${tendril.color[0]}, ${tendril.color[1]}, ${tendril.color[2]}, 0.3)`);
        gradient.addColorStop(1, `rgba(${tendril.color[0]}, ${tendril.color[1]}, ${tendril.color[2]}, 0)`);
        ctx.lineWidth = tendril.width;
        ctx.strokeStyle = gradient;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tendril.startX, tendril.startY);
        ctx.bezierCurveTo(
          tendril.cp1X,
          tendril.cp1Y,
          tendril.cp2X,
          tendril.cp2Y,
          tendril.endX,
          tendril.endY
        );
        ctx.stroke();
      });
    };

    const createStain = (boundary, index) => {
      const canvas = doc.createElement("canvas");
      canvas.className = "section-bleed";
      canvas.width = Math.max(1, Math.round(state.viewportWidth));
      canvas.height = bleedHeight;
      canvas.style.height = `${bleedHeight}px`;
      layer.appendChild(canvas);

      const ctx = canvas.getContext("2d");
      const seedBase = hashString(`${boundary.id}:${index}:${doc.title}`);
      return {
        boundary,
        index,
        canvas,
        ctx,
        seedBase,
        width: canvas.width,
        height: bleedHeight,
        stageCanvases: [],
        generated: false,
        entered: false,
        startedAt: 0,
        progress: 0,
        rafId: 0,
        completed: false,
      };
    };

    const positionStain = (stain, boundary) => {
      const nextWidth = Math.max(1, Math.round(state.viewportWidth));
      if (stain.canvas.width !== nextWidth) {
        stain.canvas.width = nextWidth;
      }
      stain.width = stain.canvas.width;
      stain.canvas.style.width = `${state.viewportWidth}px`;
      stain.canvas.style.left = "50%";
      stain.canvas.style.top = `${Math.round(boundary.centerY - bleedHeight * 0.5)}px`;
    };

    const drawStage = (stain, progress) => {
      if (!stain.ctx || !stain.stageCanvases.length) {
        return;
      }

      const stageCount = stain.stageCanvases.length;
      const stageProgress = clamp(progress, 0, 1) * stageCount;
      const baseIndex = Math.max(0, Math.min(stageCount - 1, Math.floor(stageProgress)));
      const nextIndex = Math.min(stageCount - 1, baseIndex + 1);
      const blend = stageProgress - baseIndex;
      const scale = mix(0.3, 1, easeOutCubic(clamp(progress, 0, 1)));

      stain.ctx.clearRect(0, 0, stain.width, stain.height);
      stain.ctx.save();
      stain.ctx.translate(stain.width * 0.5, stain.height * 0.5);
      stain.ctx.scale(scale, scale);
      stain.ctx.translate(-stain.width * 0.5, -stain.height * 0.5);
      stain.ctx.globalAlpha = 1;
      stain.ctx.drawImage(stain.stageCanvases[baseIndex], 0, 0);
      if (blend > 0.02 && nextIndex !== baseIndex) {
        stain.ctx.globalAlpha = blend;
        stain.ctx.drawImage(stain.stageCanvases[nextIndex], 0, 0);
      }
      stain.ctx.restore();
    };

    const animateStain = (stain, now) => {
      if (disposed || !stain.generated) {
        return;
      }

      if (!stain.startedAt) {
        stain.startedAt = now;
      }

      const elapsed = now - stain.startedAt;
      stain.progress = clamp(elapsed / 1500, 0, 1);
      drawStage(stain, stain.progress);

      if (stain.progress >= 1) {
        stain.completed = true;
        stain.rafId = 0;
        return;
      }

      stain.rafId = requestAnimationFrame((time) => animateStain(stain, time));
    };

    const startStain = (stain) => {
      if (stain.completed || stain.rafId || !stain.generated) {
        return;
      }
      stain.rafId = requestAnimationFrame((time) => animateStain(stain, time));
    };

    const generateStainArt = (stain) => {
      const width = stain.width;
      const height = stain.height;
      const size = width * height;
      const random = createSeededRandom(stain.seedBase);
      const layerBuffers = Array.from({ length: 5 }, () => createIntensityBuffer(width, height));
      const cumulativeBuffers = Array.from({ length: 5 }, () => createIntensityBuffer(width, height));
      const cumulativeScratch = new Uint16Array(size);
      const seedCount = 3 + Math.floor(random() * 4);
      const centerBand = height * 0.5;

      for (let seedIndex = 0; seedIndex < seedCount; seedIndex += 1) {
        let x = width * (0.16 + random() * 0.68);
        let y = centerBand + (random() * 2 - 1) * 16;
        const steps = 800 + Math.floor(random() * 1200);
        for (let step = 0; step < steps; step += 1) {
          const layerIndex = Math.min(4, Math.floor((step / Math.max(steps - 1, 1)) * 5));
          const radius = 4 + random() * 4;
          const amount = 255 * (0.15 + random() * 0.25);
          depositSoftCircle(layerBuffers[layerIndex], width, height, x, y, radius, amount);

          if (random() < 0.6) {
            x += (random() < 0.5 ? -1 : 1) * (1 + random() * 3.4);
            y += (random() < 0.55 ? 1 : -1) * random() * 1.4;
          } else {
            x += (random() * 2 - 1) * 1.5;
            y += (random() < 0.55 ? 1 : -1) * (1 + random() * 3.2);
          }

          x = clamp(x, width * 0.05, width * 0.95);
          y = clamp(y, height * 0.16, height * 0.84);
        }
      }

      for (let layerIndex = 0; layerIndex < cumulativeBuffers.length; layerIndex += 1) {
        for (let pixelIndex = 0; pixelIndex < size; pixelIndex += 1) {
          cumulativeScratch[pixelIndex] = Math.min(
            255,
            cumulativeScratch[pixelIndex] + layerBuffers[layerIndex][pixelIndex]
          );
          cumulativeBuffers[layerIndex][pixelIndex] = cumulativeScratch[pixelIndex];
        }
      }

      const finalAlphaMap = buildAlphaMap(cumulativeBuffers[cumulativeBuffers.length - 1], width, height);
      const edgePoints = buildEdgePoints(finalAlphaMap.alphaData, width, height);
      const tendrils = buildTendrils(edgePoints, stain.boundary.colors, random);
      const stageCanvases = [];

      for (let layerIndex = 0; layerIndex < cumulativeBuffers.length; layerIndex += 1) {
        const stageCanvas = createCanvas(width, height);
        const stageCtx = stageCanvas.getContext("2d");
        const alphaMap = buildAlphaMap(cumulativeBuffers[layerIndex], width, height);
        if (!stageCtx || !alphaMap.alphaData) {
          continue;
        }

        const image = colorizeAlpha(
          alphaMap.alphaData,
          width,
          height,
          stain.boundary.colors,
          stain.seedBase * 0.001 + layerIndex * 13
        );
        stageCtx.putImageData(image, 0, 0);
        stageCtx.globalCompositeOperation = "multiply";
        drawTendrils(stageCtx, tendrils, layerIndex);
        stageCtx.globalCompositeOperation = "source-over";
        stageCanvases.push(stageCanvas);
      }

      stain.stageCanvases = stageCanvases;
      stain.generated = stageCanvases.length > 0;
      stain.completed = false;
      stain.progress = 0;
      drawStage(stain, 0);
      if (stain.entered) {
        startStain(stain);
      }
    };

    boundaries.forEach((boundary, index) => {
      const stain = createStain(boundary, index);
      positionStain(stain, boundary);
      bleedStates.push(stain);
    });

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const stain = bleedStates.find((item) => item.canvas === entry.target);
          if (!stain) {
            return;
          }
          stain.entered = entry.isIntersecting && entry.intersectionRatio >= 0.3;
          if (stain.entered) {
            startStain(stain);
          }
        });
      },
      { threshold: [0.3] }
    );

    bleedStates.forEach((stain) => observer.observe(stain.canvas));

    const queueGeneration = (index) => {
      if (disposed || index >= bleedStates.length) {
        return;
      }
      const handle = scheduleIdleWork(() => {
        idleHandles = idleHandles.filter((entry) => entry !== handle);
        if (disposed) {
          return;
        }
        generateStainArt(bleedStates[index]);
        queueGeneration(index + 1);
      });
      idleHandles.push(handle);
    };

    const refreshPositions = () => {
      if (disposed) {
        return;
      }
      const nextBoundaries = collectBoundaries();
      setLayerHeight();
      bleedStates.forEach((stain, index) => {
        const nextBoundary = nextBoundaries[index] || stain.boundary;
        stain.boundary = nextBoundary;
        positionStain(stain, nextBoundary);
      });
    };

    const rebuild = debounce(() => {
      if (disposed) {
        return;
      }
      idleHandles.forEach(cancelIdleWork);
      idleHandles = [];
      bleedStates.forEach((stain) => {
        if (stain.rafId) {
          cancelAnimationFrame(stain.rafId);
          stain.rafId = 0;
        }
        stain.generated = false;
        stain.stageCanvases = [];
        stain.completed = false;
        stain.startedAt = 0;
      });
      refreshPositions();
      queueGeneration(0);
    }, 120);

    setLayerHeight();
    queueGeneration(0);

    state.sectionBleeds = {
      refreshPositions,
      rebuild,
      destroy() {
        if (disposed) {
          return;
        }
        disposed = true;
        if (observer) {
          observer.disconnect();
        }
        idleHandles.forEach(cancelIdleWork);
        idleHandles = [];
        bleedStates.forEach((stain) => {
          if (stain.rafId) {
            cancelAnimationFrame(stain.rafId);
          }
        });
        state.sectionBleeds = null;
        layer.remove();
      },
    };
  }

  function setupNarrativeThread() {
    if (!siteShell) {
      return;
    }

    if (state.narrativeThread && state.narrativeThread.destroy) {
      state.narrativeThread.destroy();
    }

    const main = siteShell.querySelector("main");
    if (!(main instanceof HTMLElement)) {
      return;
    }

    const sections = Array.from(main.children).filter((element) => element instanceof HTMLElement);
    if (!sections.length) {
      return;
    }

    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("narrative-thread");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("preserveAspectRatio", "none");

    const deepGlow = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    deepGlow.classList.add("thread-path", "thread-path-deep");
    const glow = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    glow.classList.add("thread-path", "thread-path-glow");
    const mainPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    mainPath.classList.add("thread-path", "thread-path-main");
    const pulsePath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    pulsePath.classList.add("thread-path", "thread-path-pulse");

    const knotLayer = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    knotLayer.classList.add("thread-knot-layer");

    svg.appendChild(deepGlow);
    svg.appendChild(glow);
    svg.appendChild(mainPath);
    svg.appendChild(pulsePath);
    svg.appendChild(knotLayer);
    siteShell.insertBefore(svg, siteShell.firstChild);

    const pathElements = [deepGlow, glow, mainPath, pulsePath];
    const anchorModels = [];
    const knotModels = [];
    let pathLength = 1;
    let pageHeight = Math.max(siteShell.scrollHeight, siteShell.getBoundingClientRect().height);
    let dprAwareWidth = Math.max(1, state.viewportWidth);
    let lastShapeUpdateAt = 0;
    let lastScrollReveal = -1;
    let lastMouseX = state.mouseX;
    let lastMouseY = state.mouseY;
    let reducedThreadMotion = reducedMotion;
    let disposed = false;

    const createKnot = () => {
      const group = doc.createElementNS("http://www.w3.org/2000/svg", "g");
      group.classList.add("thread-knot");
      const ring = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("r", "6");
      ring.setAttribute("cx", "0");
      ring.setAttribute("cy", "0");
      const spiral = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      spiral.setAttribute("d", "M 0 0 m 0 -3.2 a 3.2 3.2 0 1 1 -2.26 0.94 a 2.15 2.15 0 1 0 1.52 -0.63 a 1.1 1.1 0 1 1 -0.78 0.32");
      group.appendChild(ring);
      group.appendChild(spiral);
      knotLayer.appendChild(group);
      return { group, ring, spiral, x: 0, y: 0, intensity: 0 };
    };

    const createAnchorSpec = (section, targetSelector, xPercent, yOffset, boundary = false) => ({
      section,
      targetSelector,
      xPercent,
      yOffset,
      boundary,
    });

    const buildSectionSpecs = (section, index) => {
      if (!(section instanceof HTMLElement)) {
        return [];
      }

      if (section.matches(".hero, .subpage-hero")) {
        return [
          createAnchorSpec(section, ".hero-illustration, .mini-illustration svg", 0.78, 48),
          createAnchorSpec(section, ".hero-illustration, .mini-illustration svg", 0.68, 124),
          createAnchorSpec(section, ".hero-copy", 0.16, 94),
          createAnchorSpec(section, ".hero-actions", 0.84, 10),
          createAnchorSpec(section, null, 0.54, section.getBoundingClientRect().height - 36, true),
        ];
      }

      if (section.matches(".features, .detail-section")) {
        const cards = Array.from(section.querySelectorAll(".feature, .detail-card, .flow-step")).slice(0, 6);
        const specs = [
          createAnchorSpec(section, ".section-heading", 0.12, 18),
        ];
        cards.forEach((card, cardIndex) => {
          const xPercent = cardIndex % 2 === 0 ? 0.12 : 0.88;
          specs.push(createAnchorSpec(section, null, xPercent, 0));
          specs[specs.length - 1].targetNode = card;
        });
        specs.push(createAnchorSpec(section, null, 0.5, section.getBoundingClientRect().height - 48, true));
        return specs;
      }

      if (section.matches(".quote-band")) {
        return [
          createAnchorSpec(section, ".quote-layout", 0.82, 32),
          createAnchorSpec(section, ".quote-layout", 0.22, 96),
          createAnchorSpec(section, ".quote-layout", 0.74, 164),
          createAnchorSpec(section, null, 0.48, section.getBoundingClientRect().height - 34, true),
        ];
      }

      if (section.matches(".contact")) {
        const items = Array.from(section.querySelectorAll(".contact-row, .page-link-row")).slice(0, 4);
        const specs = [
          createAnchorSpec(section, ".section-heading", 0.18, 18),
        ];
        items.forEach((item, itemIndex) => {
          const xPercent = itemIndex % 2 === 0 ? 0.82 : 0.18;
          const spec = createAnchorSpec(section, null, xPercent, 0, false);
          spec.targetNode = item;
          specs.push(spec);
        });
        specs.push(createAnchorSpec(section, null, 0.58, section.getBoundingClientRect().height - 36, true));
        return specs;
      }

      return [
        createAnchorSpec(section, null, index % 2 === 0 ? 0.28 : 0.72, 36),
        createAnchorSpec(section, null, 0.5, section.getBoundingClientRect().height - 40, true),
      ];
    };

    let specs = [];

    const resolveAnchorPosition = (spec) => {
      const sectionRect = spec.section.getBoundingClientRect();
      const sectionPageTop = sectionRect.top + state.currentScroll;
      const sectionWidth = Math.max(sectionRect.width, 1);
      let x = sectionRect.left + state.currentScroll * 0 + sectionWidth * spec.xPercent;
      let y = sectionPageTop + spec.yOffset;

      const target =
        spec.targetNode ||
        (spec.targetSelector ? spec.section.querySelector(spec.targetSelector) : null);

      if (target instanceof Element) {
        const rect = target.getBoundingClientRect();
        x = rect.left + rect.width * spec.xPercent;
        y = rect.top + state.currentScroll + spec.yOffset;
      } else if (spec.boundary) {
        y = sectionPageTop + Math.max(36, sectionRect.height - 28);
      }

      return {
        x: clamp(x, 24, Math.max(state.viewportWidth - 24, 24)),
        y: clamp(y, 24, Math.max(pageHeight - 24, 24)),
      };
    };

    const initializeAnchors = () => {
      anchorModels.length = 0;
      specs.forEach((spec, index) => {
        const point = resolveAnchorPosition(spec);
        anchorModels.push({
          spec,
          index,
          boundary: !!spec.boundary,
          restX: point.x,
          restY: point.y,
          currentX: point.x,
          currentY: point.y,
          velocityX: 0,
          velocityY: 0,
        });
      });
    };

    const rebuildSpecs = () => {
      specs = sections.flatMap((section, index) => buildSectionSpecs(section, index));
    };

    const catmullRomPath = (points) => {
      if (points.length < 2) {
        return "";
      }
      const command = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
      for (let index = 0; index < points.length - 1; index += 1) {
        const p0 = points[Math.max(0, index - 1)];
        const p1 = points[index];
        const p2 = points[index + 1];
        const p3 = points[Math.min(points.length - 1, index + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        command.push(
          `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
        );
      }
      return command.join(" ");
    };

    const buildSamples = (points) => {
      const samples = [];
      if (points.length < 2) {
        return samples;
      }

      for (let index = 0; index < points.length - 1; index += 1) {
        const p0 = points[Math.max(0, index - 1)];
        const p1 = points[index];
        const p2 = points[index + 1];
        const p3 = points[Math.min(points.length - 1, index + 2)];
        let previous = { x: p1.x, y: p1.y };
        let arc = 0;
        for (let step = 1; step <= 8; step += 1) {
          const t = step / 8;
          const t2 = t * t;
          const t3 = t2 * t;
          const x = 0.5 * (
            (2 * p1.x) +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
          );
          const y = 0.5 * (
            (2 * p1.y) +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
          );
          arc += Math.hypot(x - previous.x, y - previous.y);
          previous = { x, y };
        }
        samples.push({ direct: Math.hypot(p2.x - p1.x, p2.y - p1.y), arc });
      }

      return samples;
    };

    const updateKnotTargets = () => {
      const boundaryAnchors = anchorModels.filter((anchor) => anchor.boundary);
      while (knotModels.length < boundaryAnchors.length) {
        knotModels.push(createKnot());
      }
      while (knotModels.length > boundaryAnchors.length) {
        const removed = knotModels.pop();
        if (removed) {
          removed.group.remove();
        }
      }

      boundaryAnchors.forEach((anchor, index) => {
        const knot = knotModels[index];
        knot.x = anchor.currentX;
        knot.y = anchor.currentY;
        knot.group.setAttribute("transform", `translate(${anchor.currentX.toFixed(2)} ${anchor.currentY.toFixed(2)})`);
      });
    };

    const applyDrawOn = (now, tension) => {
      const scrollAhead = state.currentScroll + state.viewportHeight * 0.5 + 200;
      const baseRatio = clamp(scrollAhead / Math.max(pageHeight, 1), 0, 1);
      let boostedRatio = baseRatio;
      knotModels.forEach((knot) => {
        const distance = Math.abs(knot.y - scrollAhead);
        const influence = Math.max(0, 1 - distance / 280);
        boostedRatio += influence * 0.03;
        const centerDistance = Math.abs(knot.y - (state.currentScroll + state.viewportHeight * 0.5));
        knot.intensity = clamp(1 - centerDistance / (state.viewportHeight * 0.7), 0.22, 1);
        knot.group.style.opacity = knot.intensity.toFixed(3);
      });

      const reveal = clamp(boostedRatio, 0, 1) * pathLength;
      if (Math.abs(reveal - lastScrollReveal) > 0.5) {
        lastScrollReveal = reveal;
        pathElements.forEach((element) => {
          element.style.strokeDasharray = `${reveal.toFixed(2)} ${Math.max(pathLength, 1).toFixed(2)}`;
          element.style.strokeDashoffset = "0";
        });
      }

      const opacity = mix(0.4, 0.8, tension);
      mainPath.style.strokeOpacity = opacity.toFixed(3);
      glow.style.strokeOpacity = mix(0.18, 0.34, tension).toFixed(3);
      deepGlow.style.strokeOpacity = mix(0.06, 0.16, tension).toFixed(3);
      const glowBlur = mix(8, 2, tension);
      glow.style.filter = `blur(${Math.max(2, glowBlur * 0.5).toFixed(2)}px)`;
      deepGlow.style.filter = `blur(${glowBlur.toFixed(2)}px)`;

      if (!reducedThreadMotion) {
        pulsePath.style.strokeDasharray = `8 ${Math.max(pathLength + 500, 500).toFixed(2)}`;
        pulsePath.style.strokeDashoffset = (-((now * 0.12) % Math.max(pathLength + 508, 508))).toFixed(2);
      } else {
        pulsePath.style.strokeDasharray = "0 9999";
      }
    };

    const recomputePath = () => {
      const points = anchorModels.map((anchor) => ({ x: anchor.currentX, y: anchor.currentY }));
      const d = catmullRomPath(points);
      pathElements.forEach((element) => element.setAttribute("d", d));
      mainPath.setAttribute("d", d);
      try {
        pathLength = Math.max(mainPath.getTotalLength(), 1);
      } catch (error) {
        pathLength = 1;
      }
      const segments = buildSamples(points);
      const averageTension = segments.length
        ? clamp(
          segments.reduce((sum, segment) => sum + segment.direct / Math.max(segment.arc, 1), 0) / segments.length,
          0.45,
          1
        )
        : 0.6;
      updateKnotTargets();
      return averageTension;
    };

    const refreshLayout = () => {
      if (disposed) {
        return;
      }
      pageHeight = Math.max(siteShell.scrollHeight, siteShell.getBoundingClientRect().height);
      dprAwareWidth = Math.max(1, state.viewportWidth);
      svg.style.height = `${Math.ceil(pageHeight)}px`;
      svg.setAttribute("viewBox", `0 0 ${dprAwareWidth} ${Math.ceil(pageHeight)}`);
      rebuildSpecs();
      initializeAnchors();
      const tension = recomputePath();
      applyDrawOn(performance.now(), tension);
    };

    const update = (now) => {
      if (disposed || !anchorModels.length) {
        return;
      }

      let changed = false;
      const useAttraction = !reducedThreadMotion;
      const stiffness = 120 / 1000;
      const damping = 0.9;

      anchorModels.forEach((anchor) => {
        let targetX = anchor.restX;
        let targetY = anchor.restY;
        if (useAttraction) {
          const dx = state.mouseX - anchor.restX;
          const dy = state.mouseY + state.currentScroll - anchor.restY;
          const distance = Math.hypot(dx, dy);
          if (distance < 300) {
            const attraction = 15 * (1 - distance / 300);
            const direction = distance || 1;
            targetX += (dx / direction) * attraction;
            targetY += (dy / direction) * attraction;
          }
        }

        anchor.velocityX += (targetX - anchor.currentX) * stiffness;
        anchor.velocityY += (targetY - anchor.currentY) * stiffness;
        anchor.velocityX *= damping;
        anchor.velocityY *= damping;
        anchor.currentX += anchor.velocityX;
        anchor.currentY += anchor.velocityY;

        if (
          Math.abs(anchor.velocityX) > 0.01 ||
          Math.abs(anchor.velocityY) > 0.01 ||
          Math.abs(targetX - anchor.currentX) > 0.2 ||
          Math.abs(targetY - anchor.currentY) > 0.2
        ) {
          changed = true;
        }
      });

      const mouseChanged = Math.abs(state.mouseX - lastMouseX) > 1 || Math.abs(state.mouseY - lastMouseY) > 1;
      if ((changed || mouseChanged) && now - lastShapeUpdateAt > 33) {
        const tension = recomputePath();
        applyDrawOn(now, tension);
        lastShapeUpdateAt = now;
      } else {
        const tension = recomputePath();
        applyDrawOn(now, tension);
      }

      lastMouseX = state.mouseX;
      lastMouseY = state.mouseY;
    };

    refreshLayout();

    state.narrativeThread = {
      update,
      refreshLayout,
      destroy() {
        if (disposed) {
          return;
        }
        disposed = true;
        svg.remove();
        state.narrativeThread = null;
      },
    };
  }

  function setupGradientMotion() {
    if (reducedMotion) {
      return;
    }

    body.classList.add("has-gradient-motion");
  }

  function setupStoryWeather() {
    if (reducedMotion || state.storyWeather) {
      return;
    }

    const canvas = doc.createElement("canvas");
    canvas.className = "weather-canvas";
    body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
      return;
    }

    const particleStride = 12;
    const offsets = {
      x: 0,
      y: 1,
      vx: 2,
      vy: 3,
      size: 4,
      rotation: 5,
      rotationSpeed: 6,
      opacity: 7,
      life: 8,
      maxLife: 9,
      type: 10,
      seed: 11,
    };
    const typeIds = {
      petal: 0,
      firefly: 1,
      sparkle: 2,
    };
    const stateTypes = {
      morning: typeIds.petal,
      afternoon: typeIds.petal,
      evening: typeIds.firefly,
      night: typeIds.sparkle,
    };
    const particleCount = isTouch ? 60 : 120;
    const particles = new Float32Array(particleCount * particleStride);
    const petalPalette = [
      [242, 196, 206],
      [184, 228, 220],
    ];
    let dpr = 1;
    let disposed = false;
    let weatherCheckId = 0;
    let activeState = "morning";
    let transitionState = null;
    let lastNow = performance.now();
    let lastScroll = state.currentScroll;

    function getWeatherStateForHour(hour) {
      if (hour >= 6 && hour < 12) {
        return "morning";
      }
      if (hour >= 12 && hour < 17) {
        return "afternoon";
      }
      if (hour >= 17 && hour < 21) {
        return "evening";
      }
      return "night";
    }

    function activeParticleLimit(mode) {
      if (mode === "evening") {
        return Math.min(particleCount, isTouch ? 24 : 40);
      }
      if (mode === "night") {
        return Math.min(particleCount, isTouch ? 36 : 60);
      }
      return Math.min(particleCount, isTouch ? 36 : 72);
    }

    function applyCanvasSize() {
      dpr = Math.min(win.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(state.viewportWidth * dpr));
      canvas.height = Math.max(1, Math.round(state.viewportHeight * dpr));
      canvas.style.width = `${state.viewportWidth}px`;
      canvas.style.height = `${state.viewportHeight}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }

    function populateParticle(index, type, resetY = true) {
      const offset = index * particleStride;
      const seed = particles[offset + offsets.seed] || Math.random() * 1000;
      particles[offset + offsets.seed] = seed;
      particles[offset + offsets.type] = type;
      particles[offset + offsets.x] = Math.random() * state.viewportWidth;
      particles[offset + offsets.y] = resetY
        ? -20 - Math.random() * state.viewportHeight * 0.35
        : Math.random() * state.viewportHeight;
      particles[offset + offsets.vx] = 0;
      particles[offset + offsets.vy] = 0;
      particles[offset + offsets.life] = Math.random() * 30;

      if (type === typeIds.petal) {
        particles[offset + offsets.size] = 6 + Math.random() * 4;
        particles[offset + offsets.rotation] = Math.random() * Math.PI * 2;
        particles[offset + offsets.rotationSpeed] = ((0.5 + Math.random() * 1.5) * Math.PI) / 180;
        particles[offset + offsets.opacity] = 0.15 + Math.random() * 0.2;
        particles[offset + offsets.maxLife] = 420 + Math.random() * 260;
        particles[offset + offsets.vy] = 0.3 + Math.random() * 0.5;
      } else if (type === typeIds.firefly) {
        particles[offset + offsets.size] = 3 + Math.random() * 2;
        particles[offset + offsets.rotation] = Math.random() * Math.PI * 2;
        particles[offset + offsets.rotationSpeed] = 0.004 + Math.random() * 0.01;
        particles[offset + offsets.opacity] = 0.18 + Math.random() * 0.15;
        particles[offset + offsets.maxLife] = 540 + Math.random() * 320;
        particles[offset + offsets.vy] = -0.08 + Math.random() * 0.16;
      } else {
        particles[offset + offsets.size] = 8 + Math.random() * 6;
        particles[offset + offsets.rotation] = Math.random() * Math.PI * 2;
        particles[offset + offsets.rotationSpeed] = 0.002 + Math.random() * 0.006;
        particles[offset + offsets.opacity] = 0.08 + Math.random() * 0.12;
        particles[offset + offsets.maxLife] = 620 + Math.random() * 320;
        particles[offset + offsets.vy] = 0.05 + Math.random() * 0.1;
      }
    }

    function syncWeatherMode() {
      const nextMode = getWeatherStateForHour(new Date().getHours());
      if (nextMode === activeState) {
        state.weatherMode = activeState;
        return;
      }
      transitionState = {
        from: activeState,
        to: nextMode,
        startAt: performance.now(),
      };
      activeState = nextMode;
      state.weatherMode = nextMode;
    }

    function initializeParticles() {
      activeState = getWeatherStateForHour(new Date().getHours());
      state.weatherMode = activeState;
      for (let index = 0; index < particleCount; index += 1) {
        populateParticle(index, stateTypes[activeState], false);
      }
    }

    function drawPetal(x, y, size, rotation, alpha, seed) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      const petalColor = petalPalette[Math.floor(seed) % petalPalette.length];
      ctx.fillStyle = `rgba(${petalColor[0]}, ${petalColor[1]}, ${petalColor[2]}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.5, size * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawFirefly(x, y, size, alpha) {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, 12);
      halo.addColorStop(0, `rgba(245, 230, 192, ${(alpha * 0.65).toFixed(3)})`);
      halo.addColorStop(1, "rgba(245, 230, 192, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(245, 230, 192, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawSparkle(x, y, size, rotation, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.5);
      ctx.lineTo(size * 0.2, 0);
      ctx.lineTo(0, size * 0.5);
      ctx.lineTo(-size * 0.2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, 0);
      ctx.lineTo(0, size * 0.2);
      ctx.lineTo(size * 0.5, 0);
      ctx.lineTo(0, -size * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function update(now, frameDelta) {
      if (disposed) {
        return;
      }

      const dt = Math.max(0.5, Math.min((frameDelta || 16.6667) / 16.6667, 2));
      const windAmplitude = activeState === "evening" ? 0.5 : 0.3;
      const windX = Math.sin(now * 0.000314) * windAmplitude;
      const scrollVelocity = state.currentScroll - lastScroll;
      const scrollBoost = Math.abs(scrollVelocity) > 5 ? 1 + Math.abs(scrollVelocity) * 0.02 : 1;
      lastScroll = state.currentScroll;
      ctx.clearRect(0, 0, state.viewportWidth, state.viewportHeight);

      const transitionProgress = transitionState
        ? clamp((now - transitionState.startAt) / 3000, 0, 1)
        : 1;
      const fromLimit = activeParticleLimit(transitionState ? transitionState.from : activeState);
      const toLimit = activeParticleLimit(activeState);
      const convertCount = transitionState ? Math.round(toLimit * transitionProgress) : toLimit;

      for (let index = 0; index < particleCount; index += 1) {
        const offset = index * particleStride;
        const isIncoming = index < convertCount;
        const assignedMode = transitionState
          ? isIncoming
            ? transitionState.to
            : transitionState.from
          : activeState;
        const assignedType = stateTypes[assignedMode];
        if (particles[offset + offsets.type] !== assignedType) {
          populateParticle(index, assignedType, true);
        }

        const activeLimit = transitionState
          ? assignedMode === transitionState.to
            ? toLimit
            : fromLimit
          : toLimit;
        if (index >= activeLimit) {
          continue;
        }

        let x = particles[offset + offsets.x];
        let y = particles[offset + offsets.y];
        let vx = particles[offset + offsets.vx];
        let vy = particles[offset + offsets.vy];
        const size = particles[offset + offsets.size];
        let rotation = particles[offset + offsets.rotation];
        const rotationSpeed = particles[offset + offsets.rotationSpeed];
        const baseOpacity = particles[offset + offsets.opacity];
        let life = particles[offset + offsets.life] + dt;
        const maxLife = particles[offset + offsets.maxLife];
        const type = particles[offset + offsets.type];
        const seed = particles[offset + offsets.seed];

        if (life > maxLife || y > state.viewportHeight + 30 || x < -40 || x > state.viewportWidth + 40) {
          populateParticle(index, assignedType, true);
          continue;
        }

        if (type === typeIds.petal) {
          vx = windX + Math.sin(life * 0.02 + seed) * 0.4;
          vy = (0.3 + (particles[offset + offsets.vy] - 0.3)) * scrollBoost;
          rotation += rotationSpeed * dt;
          x += vx * dt;
          y += vy * dt;
        } else if (type === typeIds.firefly) {
          const flowX = noise2D(seed * 0.07 + now * 0.00016, y * 0.004) - 0.5;
          const flowY = noise2D(seed * 0.09 + x * 0.004, now * 0.00012) - 0.5;
          vx = windX * 0.4 + flowX * 0.9;
          vy += flowY * 0.08;
          vy = clamp(vy, -0.3, 0.3);
          rotation += rotationSpeed * dt;
          x += vx * dt;
          y += vy * dt - Math.abs(scrollVelocity) * 0.01;
        } else {
          vx = windX * 0.55 + Math.sin(life * 0.012 + seed) * 0.18;
          vy = particles[offset + offsets.vy] * scrollBoost;
          rotation += rotationSpeed * dt;
          x += vx * dt;
          y += vy * dt;
        }

        const dx = x - state.mouseX;
        const dy = y - state.mouseY;
        const distance = Math.hypot(dx, dy);
        if (distance < 120) {
          const repelX = (dx / Math.max(distance, 1)) * 0.3;
          const repelY = (dy / Math.max(distance, 1)) * 0.2;
          x += repelX * (type === typeIds.petal ? 2.6 : 1.4) * dt;
          y += repelY * (type === typeIds.firefly ? 2.2 : 1.1) * dt;
        }

        particles[offset + offsets.x] = x;
        particles[offset + offsets.y] = y;
        particles[offset + offsets.vx] = vx;
        particles[offset + offsets.vy] = vy;
        particles[offset + offsets.rotation] = rotation;
        particles[offset + offsets.life] = life;

        let alpha = baseOpacity;
        if (type === typeIds.firefly) {
          const period = 1.5 + (seed % 2.5);
          const phaseSeconds = ((now * 0.001 + seed * 0.37) % period) / period;
          const pulse = phaseSeconds < 0.12
            ? phaseSeconds / 0.12
            : 1 - (phaseSeconds - 0.12) / 0.88;
          alpha = mix(0.05, 0.55, clamp(pulse, 0, 1));
        } else if (type === typeIds.sparkle) {
          alpha = baseOpacity;
          if ((Math.sin(now * 0.01 + seed * 3.7) + 1) * 0.5 > 0.95) {
            alpha = Math.min(baseOpacity * 3, 0.55);
          }
        }

        if (transitionState) {
          alpha *= assignedMode === transitionState.to ? transitionProgress : 1 - transitionProgress;
        }

        if (alpha <= 0.01) {
          continue;
        }

        if (type === typeIds.petal) {
          drawPetal(x, y, size, rotation, alpha, seed);
        } else if (type === typeIds.firefly) {
          drawFirefly(x, y, size, alpha);
        } else {
          drawSparkle(x, y, size, rotation, alpha);
        }
      }

      if (transitionState && transitionProgress >= 1) {
        transitionState = null;
      }
    }

    function destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      win.clearInterval(weatherCheckId);
      canvas.remove();
      body.classList.remove("has-weather");
      state.storyWeather = null;
    }

    initializeParticles();
    applyCanvasSize();
    syncWeatherMode();
    body.classList.add("has-weather");
    weatherCheckId = win.setInterval(syncWeatherMode, 60000);

    state.storyWeather = {
      canvas,
      refresh: applyCanvasSize,
      update,
      destroy,
    };
  }

  function setupBreathing() {
    if (reducedMotion) {
      return;
    }

    doc.querySelectorAll(".feature, .detail-card, .flow-step, .hero-illustration, .mini-illustration svg").forEach((element) => {
      if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) {
        return;
      }

      const delay = Math.round((Math.random() - 0.5) * 1000);
      element.style.setProperty("--breath-delay", `${delay}ms`);
      element.classList.add("ambient-breathe");

      if (element instanceof HTMLElement) {
        element.addEventListener("mouseenter", () => element.classList.add("ambient-paused"));
        element.addEventListener("mouseleave", () => element.classList.remove("ambient-paused"));
      }
      breathers.push(element);
    });
  }

  function splitText(node) {
    if (!(node instanceof HTMLElement) || node.dataset.motionSplit === "done") {
      return;
    }

    const text = node.textContent ? node.textContent.trim() : "";
    if (!text) {
      return;
    }

    const words = text.split(/\s+/);
    node.innerHTML = "";
    words.forEach((word, index) => {
      const outer = doc.createElement("span");
      outer.className = "reveal-word";
      outer.style.transitionDelay = `${index * 40}ms`;
      outer.textContent = word + (index === words.length - 1 ? "" : " ");
      node.appendChild(outer);
    });
    node.dataset.motionSplit = "done";
    revealGroups.push(node);
  }

  function setupTextReveal() {
    if (reducedMotion) {
      return;
    }

    doc.querySelectorAll("h1, h2, h3, .eyebrow, .hero-tagline, .brand-mark, .brand-note").forEach(splitText);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            requestAnimationFrame(() => {
              entry.target.classList.add("is-revealed");
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    revealGroups.forEach((group) => observer.observe(group));
  }

  function setupGlassRefraction() {
    if (reducedMotion || isTouch) {
      return;
    }

    doc.querySelectorAll(".button, .contact-row, .page-link-row").forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      element.classList.add("glass-light");
      rememberElement(element);
      const updateLight = throttleInterval((event) => {
        const rect = getViewportMetrics(element);
        if (!rect) {
          return;
        }
        scheduleFrameTask(element, () => {
          element.style.setProperty("--light-x", `${event.clientX - rect.left}px`);
          element.style.setProperty("--light-y", `${event.clientY - rect.top}px`);
        });
      }, 32);
      element.addEventListener("mousemove", (event) => {
        updateLight(event);
      }, { passive: true });
    });
  }

  function setupFlipLinks() {
    doc.querySelectorAll('a[href$=".html"], a[href*=".html#"]').forEach((link) => {
      if (!(link instanceof HTMLElement)) {
        return;
      }

      link.dataset.flipLink = "true";
      rememberElement(link);
      link.addEventListener("click", () => {
        traceInteraction("interaction:flip-link-click", () => {
          const rect = getViewportMetrics(link);
          if (!rect) {
            return;
          }
          const payload = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            label: (link.textContent || "").trim().slice(0, 80),
            hue: link.classList.contains("button-primary") ? "dark" : "light",
            time: Date.now(),
          };
          sessionStorage.setItem("flip-ghost", JSON.stringify(payload));
        });
      });
    });
  }

  function playFlipArrival() {
    const raw = sessionStorage.getItem("flip-ghost");
    if (!raw) {
      return;
    }

    sessionStorage.removeItem("flip-ghost");

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      return;
    }

    if (!payload || Date.now() - payload.time > 2500) {
      return;
    }

    const target = doc.querySelector("h1, .section-heading h2, .subpage-copy h1");
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const ghost = doc.createElement("div");
    ghost.className = `flip-ghost ${payload.hue === "dark" ? "is-dark" : ""}`;
    ghost.textContent = payload.label || " ";
    body.appendChild(ghost);

    const last = target.getBoundingClientRect();
    ghost.style.left = `${payload.x}px`;
    ghost.style.top = `${payload.y}px`;
    ghost.style.width = `${Math.max(payload.width, 80)}px`;
    ghost.style.height = `${Math.max(payload.height, 40)}px`;

    requestAnimationFrame(() => {
      const deltaX = last.left - payload.x;
      const deltaY = last.top - payload.y;
      const scaleX = Math.max(last.width, 140) / Math.max(payload.width, 80);
      const scaleY = Math.max(last.height, 54) / Math.max(payload.height, 40);

      ghost.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
      ghost.style.opacity = "0";
    });

    win.setTimeout(() => ghost.remove(), 700);
  }

  function buildParticlePoints(count, centerX, centerY, targetRect) {
    const points = [];
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 20 + Math.random() * 60;
      const burstX = centerX + Math.cos(angle) * radius;
      const burstY = centerY + Math.sin(angle) * radius;
      const tx = targetRect.left + Math.random() * targetRect.width;
      const ty = targetRect.top + Math.random() * targetRect.height;

      points.push({
        size: 2 + Math.random() * 4,
        startX: centerX,
        startY: centerY,
        burstX,
        burstY,
        targetX: tx,
        targetY: ty,
        color: ["#f2c4ce", "#b8e4dc", "#d9c8e8", "#f5e6c0"][index % 4],
      });
    }
    return points;
  }

  function runParticleMorph(trigger, destination) {
    if (reducedMotion || isTouch) {
      win.location.href = destination;
      return;
    }

    const canvas = doc.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      win.location.href = destination;
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const targetRect = {
      left: state.viewportWidth * 0.5 - 120,
      top: state.viewportHeight * 0.5 - 80,
      width: 240,
      height: 160,
    };

    canvas.className = "particle-canvas";
    canvas.width = Math.floor(state.viewportWidth * win.devicePixelRatio);
    canvas.height = Math.floor(state.viewportHeight * win.devicePixelRatio);
    canvas.style.width = `${state.viewportWidth}px`;
    canvas.style.height = `${state.viewportHeight}px`;
    body.appendChild(canvas);
    ctx.scale(win.devicePixelRatio, win.devicePixelRatio);

    body.classList.add("story-transition-active");

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const particleCount = 80 + Math.round(Math.random() * 40);
    const particles = buildParticlePoints(particleCount, centerX, centerY, targetRect);
    const duration = 1900;
    const start = performance.now();

    function frame(now) {
      const elapsed = now - start;
      const progress = clamp(elapsed / duration, 0, 1);
      ctx.clearRect(0, 0, state.viewportWidth, state.viewportHeight);

      const fade = progress < 0.12 ? 1 - progress / 0.12 : progress > 0.86 ? (progress - 0.86) / 0.14 : 0;
      ctx.fillStyle = `rgba(250, 246, 240, ${0.15 + fade * 0.3})`;
      ctx.fillRect(0, 0, state.viewportWidth, state.viewportHeight);

      particles.forEach((particle) => {
        let x = particle.startX;
        let y = particle.startY;

        if (progress < 0.32) {
          const local = easeOutCubic(progress / 0.32);
          x = particle.startX + (particle.burstX - particle.startX) * local;
          y = particle.startY + (particle.burstY - particle.startY) * local;
        } else {
          const local = easeInOutCubic((progress - 0.32) / 0.68);
          x = particle.burstX + (particle.targetX - particle.burstX) * local;
          y = particle.burstY + (particle.targetY - particle.burstY) * local;
        }

        ctx.globalCompositeOperation = "lighter";
        ctx.shadowBlur = 12;
        ctx.shadowColor = particle.color;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        win.location.href = destination;
      }
    }

    requestAnimationFrame(frame);
  }

  function setupGenerateTrigger() {
    const trigger = Array.from(doc.querySelectorAll(".button, button")).find((element) =>
      /generate/i.test((element.textContent || "").trim())
    );

    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    const handler = (event) => {
      event.preventDefault();
      traceInteraction("interaction:generate-trigger", () => {
        deferTask(() => {
          runParticleMorph(trigger, "generation.html");
        });
      });
    };

    if (trigger.tagName === "BUTTON") {
      const form = trigger.closest("form");
      if (form) {
        form.addEventListener("submit", handler);
      } else {
        trigger.addEventListener("click", handler);
      }
    } else {
      trigger.addEventListener("click", handler);
    }
  }

  function updateAnchorScroll() {
    doc.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href");
        if (!href || href === "#") {
          return;
        }

        if (!isTouch && !reducedMotion) {
          event.preventDefault();
          traceInteraction("interaction:anchor-click", () => {
            deferTask(() => {
              const target = doc.querySelector(href);
              if (!(target instanceof HTMLElement)) {
                return;
              }
              rememberElement(target);
              const metrics = getElementMetrics(target);
              if (!metrics) {
                return;
              }
              state.lastScrollInputAt = performance.now();
              state.targetScroll = clamp(metrics.pageTop - 24, 0, state.maxScroll);
              win.scrollTo({ top: state.targetScroll, behavior: "auto" });
            });
          });
        }
      });
    });
  }

  function animationFrame(now) {
    if (!state.currentTime) {
      state.currentTime = now;
    }

    const frameDelta = now - state.currentTime;
    state.currentTime = now;
    state.frameIndex += 1;
    state.frameTimes.push(frameDelta);
    state.frameTimeTotal += frameDelta;
    if (state.frameTimes.length > 24) {
      state.frameTimeTotal -= state.frameTimes.shift();
    }
    const averageFrame = state.frameTimeTotal / Math.max(state.frameTimes.length, 1);
    if (averageFrame > 24) {
      state.performanceMode = "low";
    } else if (averageFrame > 18) {
      state.performanceMode = "medium";
    } else {
      state.performanceMode = "high";
    }

    if (!isTouch && !reducedMotion && siteShell) {
      const delta = clamp(state.targetScroll - state.currentScroll, -240, 240);
      const sinceWheel = now - (state.lastWheelAt || 0);
      const sinceInput = now - (state.lastScrollInputAt || 0);
      const performanceMode = state.performanceMode || "high";
      const settleFactor = performanceMode === "low" ? 0.74 : performanceMode === "medium" ? 0.68 : 0.62;
      const glideFactor = performanceMode === "low" ? 0.64 : performanceMode === "medium" ? 0.58 : 0.52;
      const easing = sinceWheel < 80 ? glideFactor : settleFactor;
      state.currentScroll += delta * easing;

      if (sinceInput > 40 && Math.abs(state.targetScroll - state.currentScroll) < 0.5) {
        state.targetScroll = state.currentScroll;
      }

      if (Math.abs(state.targetScroll - state.currentScroll) < 0.2) {
        state.currentScroll = state.targetScroll;
      }
      siteShell.style.transform = `translate3d(0, ${-state.currentScroll}px, 0)`;
    } else {
      state.currentScroll = win.scrollY;
      state.targetScroll = win.scrollY;
    }

    if (state.updateCursor) {
      state.updateCursor();
    }

    const activeScroll =
      Math.abs(state.targetScroll - state.currentScroll) > 1 ||
      now - (state.lastWheelAt || 0) < 160 ||
      now - (state.lastScrollInputAt || 0) < 160;

    updateMagnetic();
    if (shouldRunEffect("constellation", activeScroll)) {
      updateConstellation(now);
    }
    if (state.storyWeather && state.storyWeather.update && shouldRunEffect("weather", activeScroll)) {
      state.storyWeather.update(now, getEffectDelta("weather", now, frameDelta || 16.6667));
    }
    if (state.narrativeThread && state.narrativeThread.update && shouldRunEffect("thread", activeScroll)) {
      state.narrativeThread.update(now);
    }
    updateParallax(state.currentScroll);
    if (shouldRunEffect("svg", activeScroll)) {
      updateSVGMorphing(state.currentScroll, now);
    }
    if (shouldRunEffect("depth", activeScroll)) {
      updateVolumetricDepth(now);
    }
    requestAnimationFrame(animationFrame);
  }

  function init() {
    setInkModeBadge("off");
    updateViewport();
    setupSmoothScroll();
    setupCustomCursor();
    setupMagneticHover();
    setupButtonMicroInteractions();
    setupConstellation();
    setupStoryWeather();
    setupVolumetricDepth();
    setupParallax();
    setupSVGMorphing();
    setupGradientMotion();
    setupSectionBleeds();
    setupNarrativeThread();
    setupBreathing();
    setupTextReveal();
    setupGlassRefraction();
    setupFlipLinks();
    playFlipArrival();
    setupGenerateTrigger();
    updateAnchorScroll();
    scheduleLayoutRefresh();
    requestAnimationFrame(animationFrame);
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

const SAFE_INSET_RATIO = 0.05;
const FRAME_SAMPLE_COUNT = 120;
const safeArea = required("#safe-area");
const viewportReadout = required("#viewport-readout");
const activationOutput = required("#activation-count");
const backOutput = required("#back-count");
const focusTargets = [...document.querySelectorAll("[data-focus-order]")];

let activationCount = 0;
let backRequestCount = 0;
let frameDeltas = [];
let previousFrameTime;

function required(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing TV conformance element ${selector}`);
  return element;
}

function rounded(value) {
  return Number(value.toFixed(3));
}

function rectangle(element) {
  const value = element.getBoundingClientRect();
  return {
    left: rounded(value.left),
    top: rounded(value.top),
    right: rounded(value.right),
    bottom: rounded(value.bottom),
    width: rounded(value.width),
    height: rounded(value.height),
  };
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * ratio) - 1] ?? 0;
}

function inside(inner, outer) {
  const tolerance = 0.5;
  return (
    inner.left >= outer.left - tolerance
    && inner.top >= outer.top - tolerance
    && inner.right <= outer.right + tolerance
    && inner.bottom <= outer.bottom + tolerance
  );
}

function publishProbe() {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };
  const safeRectangle = rectangle(safeArea);
  const critical = [...document.querySelectorAll(".critical")].map(
    (element) => {
      const bounds = rectangle(element);
      return {
        id: element.id || element.tagName.toLowerCase(),
        bounds,
        insideSafeArea:
          element === safeArea || inside(bounds, safeRectangle),
      };
    },
  );
  const criticalTextCssPx = [
    ...document.querySelectorAll("[data-critical-text]"),
  ].map((element) =>
    rounded(Number.parseFloat(getComputedStyle(element).fontSize))
  );
  const targets = focusTargets.map((element) => ({
    label: element.textContent?.trim() ?? "",
    bounds: rectangle(element),
    focusOrder: Number(element.dataset.focusOrder),
  }));
  const sortedDeltas = frameDeltas.slice(0, FRAME_SAMPLE_COUNT);
  globalThis.__vcgTvConformanceProbe = Object.freeze({
    schemaVersion: 1,
    ready: sortedDeltas.length === FRAME_SAMPLE_COUNT,
    viewport,
    expectedSafeArea: {
      left: rounded(viewport.width * SAFE_INSET_RATIO),
      top: rounded(viewport.height * SAFE_INSET_RATIO),
      right: rounded(viewport.width * (1 - SAFE_INSET_RATIO)),
      bottom: rounded(viewport.height * (1 - SAFE_INSET_RATIO)),
    },
    safeArea: safeRectangle,
    critical,
    criticalTextCssPx,
    targets,
    activeFocusOrder:
      document.activeElement?.dataset.focusOrder === undefined
        ? null
        : Number(document.activeElement.dataset.focusOrder),
    activationCount,
    backRequestCount,
    animation: {
      sampleCount: sortedDeltas.length,
      p50DeltaMs: rounded(percentile(sortedDeltas, 0.5)),
      p95DeltaMs: rounded(percentile(sortedDeltas, 0.95)),
      worstDeltaMs: rounded(Math.max(0, ...sortedDeltas)),
      negativeDeltaCount: sortedDeltas.filter((value) => value < 0).length,
    },
  });
}

function focusRelative(direction) {
  const current = focusTargets.indexOf(document.activeElement);
  const next =
    current < 0
      ? 0
      : (current + direction + focusTargets.length) % focusTargets.length;
  focusTargets[next].focus();
}

for (const target of focusTargets) {
  target.addEventListener("click", () => {
    activationCount += 1;
    activationOutput.textContent = `ACTIVATIONS ${activationCount}`;
    publishProbe();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    focusRelative(1);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    focusRelative(-1);
  } else if (event.key === "Escape") {
    event.preventDefault();
    backRequestCount += 1;
    backOutput.textContent = `BACK REQUESTS ${backRequestCount}`;
    publishProbe();
  }
});

function sampleFrame(timestamp) {
  if (previousFrameTime !== undefined && frameDeltas.length < FRAME_SAMPLE_COUNT) {
    frameDeltas.push(timestamp - previousFrameTime);
  }
  previousFrameTime = timestamp;
  publishProbe();
  if (frameDeltas.length < FRAME_SAMPLE_COUNT) requestAnimationFrame(sampleFrame);
}

viewportReadout.textContent =
  `${window.innerWidth} × ${window.innerHeight} CSS PX`;
window.addEventListener("resize", () => {
  viewportReadout.textContent =
    `${window.innerWidth} × ${window.innerHeight} CSS PX`;
  frameDeltas = [];
  previousFrameTime = undefined;
  requestAnimationFrame(sampleFrame);
});
publishProbe();
requestAnimationFrame(sampleFrame);

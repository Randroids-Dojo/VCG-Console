const degrees = (radians) => (radians * 180) / Math.PI;
const radians = (degreesValue) => (degreesValue * Math.PI) / 180;
const round = (value, digits = 1) => Number(value.toFixed(digits));

const defaults = {
  cameraHeightFt: 1.5,
  zoneNearFt: 4,
  zoneFarFt: 12,
  zoneWidthFt: 8,
  lateralMarginFt: 0.5,
  playerHeightFt: 6.5,
  headroomFt: 0.5,
};

const flags = new Map([
  ["--camera-height-ft", "cameraHeightFt"],
  ["--near-ft", "zoneNearFt"],
  ["--far-ft", "zoneFarFt"],
  ["--zone-width-ft", "zoneWidthFt"],
  ["--lateral-margin-ft", "lateralMarginFt"],
  ["--player-height-ft", "playerHeightFt"],
  ["--headroom-ft", "headroomFt"],
]);

function usage() {
  console.log(`Usage: node scripts/camera-optics.mjs [options]

Estimate the field of view and pixel-density envelope for a below-TV camera.

Options:
  --camera-height-ft N    Lens-center height above the floor (default 1.5)
  --near-ft N             Nearest player distance (default 4)
  --far-ft N              Farthest player distance (default 12)
  --zone-width-ft N       Required play-zone width (default 8)
  --lateral-margin-ft N   Extra margin on each side (default 0.5)
  --player-height-ft N    Tallest blocking player height (default 6.5)
  --headroom-ft N         Required margin above the player (default 0.5)
  --json                   Emit machine-readable JSON
  --help                   Show this help

Vendor field-of-view values are hypotheses. Measure the delivered lens.`);
}

function parseArgs(argv) {
  const config = { ...defaults };
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      usage();
      process.exit(0);
    }
    if (arg === "--json") {
      json = true;
      continue;
    }

    const key = flags.get(arg);
    if (!key) throw new Error(`Unknown option: ${arg}`);
    const rawValue = argv[index + 1];
    if (rawValue === undefined) throw new Error(`Missing value for ${arg}`);
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${arg} must be a positive number`);
    config[key] = value;
    index += 1;
  }

  if (config.zoneFarFt <= config.zoneNearFt) throw new Error("--far-ft must be greater than --near-ft");
  return { config, json };
}

function verticalFromHorizontal(horizontalFovDegrees, aspectRatio) {
  return degrees(2 * Math.atan(Math.tan(radians(horizontalFovDegrees) / 2) / aspectRatio));
}

function horizontalAndVerticalFromDiagonal(diagonalFovDegrees, aspectRatio) {
  const diagonalTangent = Math.tan(radians(diagonalFovDegrees) / 2);
  const verticalTangent = diagonalTangent / Math.sqrt(aspectRatio ** 2 + 1);
  return {
    horizontal: degrees(2 * Math.atan(verticalTangent * aspectRatio)),
    vertical: degrees(2 * Math.atan(verticalTangent)),
  };
}

function calculate(config) {
  const halfWidth = config.zoneWidthFt / 2 + config.lateralMarginFt;
  const requiredHorizontal = degrees(2 * Math.atan(halfWidth / config.zoneNearFt));
  const floorDown = degrees(Math.atan(config.cameraHeightFt / config.zoneNearFt));
  const headUp = degrees(
    Math.atan((config.playerHeightFt + config.headroomFt - config.cameraHeightFt) / config.zoneNearFt),
  );
  const requiredVertical = floorDown + headUp;
  const pitchUp = (headUp - floorDown) / 2;
  const brio = horizontalAndVerticalFromDiagonal(90, 16 / 9);

  const candidates = [
    {
      name: "Logitech BRIO 90-degree diagonal",
      horizontal: brio.horizontal,
      vertical: brio.vertical,
      source: "converted from 90-degree diagonal at 16:9",
    },
    {
      name: "ELP AR0234 H100",
      horizontal: 101,
      vertical: verticalFromHorizontal(101, 16 / 9),
      source: "vendor horizontal claim, 16:9 vertical derived",
    },
    {
      name: "ELP AR0234 H110",
      horizontal: 112,
      vertical: verticalFromHorizontal(112, 16 / 9),
      source: "vendor horizontal claim, 16:9 vertical derived",
    },
    {
      name: "ELP AR0234 H120",
      horizontal: 126,
      vertical: verticalFromHorizontal(126, 16 / 9),
      source: "vendor horizontal claim, 16:9 vertical derived",
    },
  ].map((candidate) => {
    const sceneWidthAtFar = 2 * config.zoneFarFt * Math.tan(radians(candidate.horizontal) / 2);
    const sceneHeightAtFar = 2 * config.zoneFarFt * Math.tan(radians(candidate.vertical) / 2);
    const playerPixelsAtFar = (1080 * config.playerHeightFt) / sceneHeightAtFar;
    return {
      name: candidate.name,
      horizontalFovDegrees: round(candidate.horizontal),
      verticalFovDegrees: round(candidate.vertical),
      coversWidth: candidate.horizontal >= requiredHorizontal,
      coversNearPlayerVertically: candidate.vertical >= requiredVertical,
      sceneWidthAtFarFt: round(sceneWidthAtFar),
      estimatedPlayerPixelsAtFar: Math.round(playerPixelsAtFar),
      source: candidate.source,
    };
  });

  return {
    assumptions: config,
    required: {
      horizontalFovDegrees: round(requiredHorizontal),
      verticalFovDegrees: round(requiredVertical),
      suggestedPitchUpDegrees: round(pitchUp),
    },
    candidates,
    caveats: [
      "This is a pinhole-geometry screen, not camera qualification.",
      "Vendor field-of-view labels can be diagonal, horizontal, rounded, or revision-dependent.",
      "Distortion, exposure, blur, MJPEG latency, and pose accuracy require delivered-hardware tests.",
    ],
  };
}

try {
  const { config, json } = parseArgs(process.argv.slice(2));
  const result = calculate(config);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("VCG camera optical preflight\n");
    console.log("Assumptions", result.assumptions);
    console.log("Required envelope", result.required);
    console.table(
      result.candidates.map(({ source: _source, ...candidate }) => candidate),
    );
    console.log("\nCaveats");
    for (const caveat of result.caveats) console.log(`- ${caveat}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Run with --help for usage.");
  process.exitCode = 1;
}

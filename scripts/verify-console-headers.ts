// Checks that a running console server applies the browser boundary the
// launcher depends on. A plain static file server answers the same URLs with
// the same bytes and no boundary headers, which silently disables
// cross-origin isolation and the camera permission policy. Run this against
// the server that will actually serve the appliance.
//
// usage: tsx scripts/verify-console-headers.ts [--url http://127.0.0.1:4173]

import { evaluateBoundaryHeaders, type BoundaryHeaderFailure } from "./console-boundary-policy";

/** Matches the `preview` script in apps/console-lab/package.json. */
const DEFAULT_CONSOLE_URL = "http://127.0.0.1:4173";

interface Probe {
  pathname: string;
  acceptsHtml: boolean;
  purpose: string;
}

const probes: Probe[] = [
  { pathname: "/", acceptsHtml: true, purpose: "launcher document" },
  {
    pathname: "/models/pose_landmarker_lite.task",
    acceptsHtml: false,
    purpose: "pinned pose model",
  },
  { pathname: "/fonts/OCRA.ttf", acceptsHtml: false, purpose: "pinned console typeface" },
];

function parseBaseUrl(argv: string[]): URL {
  const flag = argv.indexOf("--url");
  if (flag !== -1 && !argv[flag + 1]) throw new Error("--url requires a value");
  const url = new URL(flag === -1 ? DEFAULT_CONSOLE_URL : argv[flag + 1]);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported scheme: ${url.protocol}`);
  }
  return url;
}

async function probe(base: URL, target: Probe): Promise<BoundaryHeaderFailure[]> {
  const url = new URL(target.pathname, base);
  const response = await fetch(url, {
    headers: target.acceptsHtml ? { accept: "text/html" } : { accept: "*/*" },
  });
  if (!response.ok) {
    throw new Error(`${target.purpose} (${target.pathname}) returned HTTP ${response.status}`);
  }
  // Only the headers matter. Discard the body without buffering it: the pinned
  // pose model alone is 5.78 MB, and reading it would dominate this check.
  await response.body?.cancel();
  return evaluateBoundaryHeaders(target.pathname, target.acceptsHtml, response.headers);
}

async function main(): Promise<void> {
  const base = parseBaseUrl(process.argv.slice(2));
  let failed = false;
  for (const target of probes) {
    const failures = await probe(base, target);
    if (failures.length === 0) {
      console.log(`ok ${target.pathname} (${target.purpose})`);
      continue;
    }
    failed = true;
    console.error(`FAIL ${target.pathname} (${target.purpose})`);
    for (const failure of failures) {
      console.error(
        `  ${failure.header}: expected ${JSON.stringify(failure.expected)}, observed ${
          failure.observed === undefined ? "no header" : JSON.stringify(failure.observed)
        }`,
      );
    }
  }
  if (failed) {
    console.error(
      `\n${base.origin} is not serving the console browser boundary. A camera-capable launcher requires the exact headers above; do not treat this server as a console surface.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`\n${base.origin} serves the required console browser boundary.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

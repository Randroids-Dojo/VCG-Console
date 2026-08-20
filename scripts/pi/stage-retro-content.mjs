// Stages one operator-owned retro collection into the console-managed content
// layout, hashing every ROM before it is transferred to a target.
//
// Per D-185 this repository vendors no third-party content. ROMs stay on the
// operator's own storage; this tool only reads them, verifies them, and writes
// a hashed payload tree outside the repository for `deploy-retro-content.sh` to
// transfer. Nothing it produces is committed.
//
// Object names and the entry grammar follow `vcg_host::retro_import` exactly:
//
//   objects/<systemId>-content-<sha256><extension>
//
// with `entryId` = `content-<sha256>`, lowercase-hex digests, safe lowercase
// system/core/controller IDs, a canonical lowercase extension of at most eight
// characters, and an NFC display title of at most 80 characters.
//
// What this does NOT do: it does not write a native installed-library
// generation, and it records no session evidence. A USB or paired-LAN import
// binds `provenance.importSessionId` and an entitlement acknowledgement to a
// real session; no such session exists when an operator stages their own files.
//
// Committing a staged payload into the library is a separate privileged step on
// the target, `vcg-host retro-provision`, which recomputes every digest itself
// rather than trusting this manifest and commits under an
// `operator-provisioned` transport. See docs/RETRO_CONTENT_DEPLOYMENT.md.
//
// usage:
//   node scripts/pi/stage-retro-content.mjs --source DIR --system ID --core ID
//     [--controller-profile ID] [--out DIR] [--extensions .a,.b] [--limit N]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";

const SYSTEMS = {
  nes: { extensions: [".nes", ".fds", ".unf", ".unif"], maxBytes: 16 * 1024 * 1024 },
  snes: {
    extensions: [".smc", ".sfc", ".swc", ".fig", ".bs", ".st"],
    maxBytes: 16 * 1024 * 1024,
  },
};

// The archive boundary this mirrors accepts exactly one payload per container.
const ARCHIVE_EXTENSION = ".zip";
const MAX_TITLE_CHARACTERS = 80;
const MAX_ENTRIES = 100_000;

function parseArguments(argv) {
  const options = {
    source: "",
    system: "",
    core: "",
    controllerProfile: "retropad-standard-v1",
    out: "",
    extensions: "",
    limit: 0,
  };
  const flags = {
    "--source": "source",
    "--system": "system",
    "--core": "core",
    "--controller-profile": "controllerProfile",
    "--out": "out",
    "--extensions": "extensions",
    "--limit": "limit",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = flags[argv[index]];
    if (!key) throw new Error(`unknown option: ${argv[index]}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${argv[index]} needs a value`);
    options[key] = key === "limit" ? Number.parseInt(value, 10) : value;
    index += 1;
  }
  if (!options.source) throw new Error("--source is required");
  if (!options.system) throw new Error("--system is required");
  if (!options.core) throw new Error("--core is required");
  if (options.limit && !Number.isSafeInteger(options.limit)) {
    throw new Error("--limit must be an integer");
  }
  return options;
}

// Mirrors `validate_safe_id`: lowercase alphanumerics plus separators, never
// leading, trailing, or doubled. No package names these, so a dot is allowed.
function assertSafeId(label, value, maximum = 64) {
  const safe =
    value.length > 0 &&
    value.length <= maximum &&
    /^[a-z0-9]([a-z0-9]|[.-](?![.-]))*[a-z0-9]$/.test(value);
  if (!safe) throw new Error(`${label} is not a safe identifier: ${value}`);
  return value;
}

// Mirrors `validate_bindable_id`. A signed catalog names a library package's
// system and core in a grammar that excludes ".", so an identifier carrying one
// stages fine and is then refused by the host -- after the whole collection has
// been hashed and transferred. Reject it here instead.
function assertBindableId(label, value, maximum = 64) {
  const safe =
    value.length > 0 &&
    value.length <= maximum &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  if (!safe) throw new Error(`${label} is not a bindable identifier: ${value}`);
  return value;
}

// Mirrors `validate_extension`: a dot plus 1-8 lowercase alphanumerics.
function canonicalExtension(raw) {
  const lowered = raw.toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(lowered)) return null;
  return lowered;
}

// Mirrors `is_unsafe_display_character`. A title this admits but the host
// refuses fails the whole payload on the target, so the ranges must match:
// controls and every non-space whitespace, the format and bidi characters, the
// astral tag and musical controls, and lone surrogates.
const UNSAFE_DISPLAY = new Set([
  0x00ad, 0x061c, 0x180e, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0xfeff,
]);

const UNSAFE_DISPLAY_RANGES = [
  [0x0000, 0x001f],
  [0x007f, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200f],
  [0x2028, 0x202f],
  [0x205f, 0x205f],
  [0x2066, 0x206f],
  [0x3000, 0x3000],
  [0xd800, 0xdfff],
  [0xfff9, 0xfffb],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
  [0xe0001, 0xe0001],
  [0xe0020, 0xe007f],
];

function isUnsafeDisplayCharacter(codePoint) {
  for (const [low, high] of UNSAFE_DISPLAY_RANGES) {
    if (codePoint >= low && codePoint <= high) return true;
  }
  return UNSAFE_DISPLAY.has(codePoint);
}

function deriveTitle(sourceName) {
  const withoutExtension = sourceName.slice(
    0,
    sourceName.length - extname(sourceName).length,
  );
  let title = withoutExtension.normalize("NFC");
  title = [...title]
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      if (isUnsafeDisplayCharacter(codePoint)) return false;
      if (character === "/" || character === "\\") return false;
      // Any whitespace that is not a plain space is rejected by the host.
      return !(/\s/.test(character) && character !== " ");
    })
    .join("");
  title = title.replace(/ {2,}/g, " ").trim();
  if ([...title].length > MAX_TITLE_CHARACTERS) {
    title = [...title].slice(0, MAX_TITLE_CHARACTERS).join("").trim();
  }
  return title;
}

function listFiles(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) found.push(path);
    }
  };
  walk(root);
  return found.sort();
}

// GNU tar cannot read ZIP, and it is what a bare `tar` resolves to in both a
// Git Bash and a Debian PATH, so the reader is resolved explicitly rather than
// assumed. libarchive's bsdtar is preferred; Info-ZIP's unzip is accepted too.
let archiveReader = null;

function resolveArchiveReader() {
  if (archiveReader) return archiveReader;
  const candidates = [];
  if (process.platform === "win32" && process.env.SystemRoot) {
    candidates.push({
      kind: "bsdtar",
      command: join(process.env.SystemRoot, "System32", "tar.exe"),
    });
  }
  candidates.push({ kind: "bsdtar", command: "bsdtar" });
  candidates.push({ kind: "bsdtar", command: "tar" });
  candidates.push({ kind: "unzip", command: "unzip" });

  for (const candidate of candidates) {
    let version;
    try {
      version = execFileSync(
        candidate.command,
        candidate.kind === "bsdtar" ? ["--version"] : ["-v"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
    } catch {
      continue;
    }
    if (candidate.kind === "bsdtar" && !/bsdtar|libarchive/i.test(version)) continue;
    if (candidate.kind === "unzip" && !/unzip/i.test(version)) continue;
    archiveReader = candidate;
    return archiveReader;
  }
  throw new Error(
    "no ZIP reader found. Install libarchive's bsdtar or Info-ZIP's unzip; " +
      "GNU tar cannot read ZIP containers.",
  );
}

function listArchive(reader, archivePath) {
  const argv =
    reader.kind === "bsdtar" ? ["-tf", archivePath] : ["-Z1", archivePath];
  return execFileSync(reader.command, argv, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Extracts the whole container to stdout rather than naming the entry. Both
// readers treat a named entry as a glob, and ROM sets are full of literal
// `[!]`, `[b1]`, and `(U)` markers that a pattern match then fails to find.
// The caller has already proven the container holds exactly one file, so
// "everything" and "that entry" are the same bytes.
function extractArchiveContents(reader, archivePath) {
  const argv =
    reader.kind === "bsdtar" ? ["-xOf", archivePath] : ["-p", archivePath];
  return execFileSync(reader.command, argv, { maxBuffer: 256 * 1024 * 1024 });
}

// Listing first keeps a multi-file or wrong-payload container from being
// silently accepted.
function readSingleArchivePayload(archivePath, allowedExtensions) {
  const reader = resolveArchiveReader();
  const listing = listArchive(reader, archivePath)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith("/"));

  if (listing.length === 0) return { error: "archive is empty" };
  if (listing.length > 1) {
    return { error: `archive holds ${listing.length} files, expected exactly one` };
  }

  const inner = listing[0];
  // Reject traversal by segment, not by substring: ROM sets legitimately
  // contain runs of dots, as in "Dragon Quest III - Soshite Densetsu e....sfc".
  const segments = inner.split("/");
  const unsafePath =
    inner.startsWith("/") ||
    inner.includes("\\") ||
    /^[A-Za-z]:/.test(inner) ||
    segments.some((segment) => segment === "." || segment === "..");
  if (unsafePath) {
    return { error: `archive path is unsafe: ${inner}` };
  }

  const rawExtension = extname(inner);
  if (rawExtension.length === 0) {
    return { error: "archive payload has no file extension" };
  }
  const extension = canonicalExtension(rawExtension);
  if (!extension || !allowedExtensions.includes(extension)) {
    return { error: `archive payload extension is not supported: ${rawExtension}` };
  }

  const bytes = extractArchiveContents(reader, archivePath);
  return { bytes, extension, innerName: basename(inner) };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const system = assertBindableId("--system", options.system);
  const coreId = assertBindableId("--core", options.core);
  const controllerProfile = assertSafeId(
    "--controller-profile",
    options.controllerProfile,
  );

  const profile = SYSTEMS[system];
  if (!profile && !options.extensions) {
    throw new Error(
      `no built-in extension set for system '${system}'; pass --extensions`,
    );
  }
  const allowedExtensions = (
    options.extensions
      ? options.extensions.split(",").map((value) => value.trim())
      : profile.extensions
  ).map((value) => {
    const canonical = canonicalExtension(
      value.startsWith(".") ? value : `.${value}`,
    );
    if (!canonical) throw new Error(`unsupported extension: ${value}`);
    return canonical;
  });
  const maxBytes = profile ? profile.maxBytes : 64 * 1024 * 1024;

  const sourceRoot = resolve(options.source);
  if (!statSync(sourceRoot).isDirectory()) {
    throw new Error(`--source is not a directory: ${sourceRoot}`);
  }
  const outRoot = resolve(options.out || join("build", "retro-content", system));
  const objectRoot = join(outRoot, "objects");
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(objectRoot, { recursive: true });

  const files = listFiles(sourceRoot);
  const entries = [];
  const skipped = [];
  const byContent = new Map();
  let totalBytes = 0;

  for (const path of files) {
    if (options.limit && entries.length >= options.limit) break;
    const sourceName = basename(path);
    const outerExtension = canonicalExtension(extname(sourceName));

    let bytes;
    let extension;
    let container = "plain";

    if (outerExtension === ARCHIVE_EXTENSION) {
      const payload = readSingleArchivePayload(path, allowedExtensions);
      if (payload.error) {
        skipped.push({ sourceName, reason: payload.error });
        continue;
      }
      bytes = payload.bytes;
      extension = payload.extension;
      container = "zip";
    } else if (outerExtension && allowedExtensions.includes(outerExtension)) {
      bytes = readFileSync(path);
      extension = outerExtension;
    } else {
      skipped.push({ sourceName, reason: "extension is not supported" });
      continue;
    }

    if (bytes.length === 0) {
      skipped.push({ sourceName, reason: "file is empty" });
      continue;
    }
    if (bytes.length > maxBytes) {
      skipped.push({
        sourceName,
        reason: `content exceeds the ${maxBytes}-byte ceiling`,
      });
      continue;
    }

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const duplicate = byContent.get(sha256);
    if (duplicate) {
      skipped.push({
        sourceName,
        reason: `identical content already staged as "${duplicate}"`,
      });
      continue;
    }

    const title = deriveTitle(sourceName);
    if (title.length === 0) {
      skipped.push({ sourceName, reason: "no safe display title survives" });
      continue;
    }

    const entryId = `content-${sha256}`;
    const objectName = `${system}-${entryId}${extension}`;
    writeFileSync(join(objectRoot, objectName), bytes);

    byContent.set(sha256, title);
    totalBytes += bytes.length;
    entries.push({
      entryId,
      systemId: system,
      sha256,
      sizeBytes: bytes.length,
      extension,
      title,
      coreId,
      controllerProfile,
      objectName,
      container,
    });

    if (entries.length > MAX_ENTRIES) {
      throw new Error(`staged entries exceed the ${MAX_ENTRIES}-entry ceiling`);
    }
  }

  entries.sort((left, right) => (left.sha256 < right.sha256 ? -1 : 1));

  const manifest = {
    schemaVersion: 1,
    documentType: "vcg-operator-staged-retro-content",
    systemId: system,
    coreId,
    controllerProfile,
    // Deliberately not a native installed-library generation. See the header.
    provenance: "operator-staged-local-collection",
    sourceLabel: basename(sourceRoot),
    entryCount: entries.length,
    totalBytes,
    entries,
  };
  writeFileSync(
    join(outRoot, "staged-content.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const digestLines = entries
    .map((entry) => `${entry.sha256}  objects/${entry.objectName}`)
    .join("\n");
  writeFileSync(join(outRoot, "SHA256SUMS"), `${digestLines}\n`, "utf8");

  const skippedLines = skipped
    .map((entry) => `${entry.sourceName}\t${entry.reason}`)
    .join("\n");
  writeFileSync(
    join(outRoot, "skipped.tsv"),
    skipped.length > 0 ? `${skippedLines}\n` : "",
    "utf8",
  );

  const megabytes = (totalBytes / (1024 * 1024)).toFixed(1);
  console.log(`system:   ${system} (core ${coreId})`);
  console.log(`source:   ${sourceRoot}`);
  console.log(`staged:   ${entries.length} of ${files.length} files, ${megabytes} MiB`);
  console.log(`skipped:  ${skipped.length}`);
  console.log(`payload:  ${outRoot}${sep}`);
  if (skipped.length > 0) {
    const reasons = new Map();
    for (const entry of skipped) {
      reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
    }
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${reason}`);
    }
  }
  console.log("");
  console.log("Staging is not qualification. These digests prove the bytes that");
  console.log("were read, not that any title runs, saves, or is playable.");
}

main();

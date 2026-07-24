import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(root, "compliance");
const sbomPath = resolve(outputDirectory, "vcg-console.cdx.json");
const noticesPath = resolve(outputDirectory, "DEPENDENCY_NOTICES.md");
const check = process.argv.includes("--check");
const release = process.argv.includes("--release");

const npmAll = flattenPnpmLicenses(runPnpm(["licenses", "list", "--json"]));
const npmProductionRefs = new Set(
  flattenPnpmLicenses(runPnpm(["licenses", "list", "--json", "--prod"])).map(refOf),
);
const workspaces = JSON.parse(runPnpm(["list", "-r", "--depth", "-1", "--json"]));
const cargo = JSON.parse(runCargo(["metadata", "--format-version", "1", "--locked"]));
const provenance = JSON.parse(
  await readFile(resolve(root, "apps/console-lab/public/ASSET_PROVENANCE.json"), "utf8"),
);

const rootWorkspace = workspaces.find((workspace) => workspace.name === "vcg-console");
if (!rootWorkspace) throw new Error("root pnpm workspace is missing");

const rootComponent = workspaceComponent(rootWorkspace);
const components = [
  ...workspaces.filter((workspace) => workspace !== rootWorkspace).map(workspaceComponent),
  ...npmAll.map((component) => ({
    ...component,
    scope: npmProductionRefs.has(refOf(component)) ? "required" : "excluded",
  })),
  ...cargoComponents(cargo),
  ...assetComponents(provenance),
].sort((left, right) => left["bom-ref"].localeCompare(right["bom-ref"]));

const duplicateRefs = duplicates(components.map((component) => component["bom-ref"]));
if (duplicateRefs.length > 0) throw new Error(`duplicate BOM references: ${duplicateRefs.join(", ")}`);

const unresolved = [
  { id: "project-license", refs: [rootComponent, ...components].filter(isFirstParty).map(refOf) },
  {
    id: "pose-model-license",
    refs: components.filter((component) => property(component, "vcg:license-status") === "unresolved-model-license").map(refOf),
  },
];
const unknownLicenseGaps = components
  .filter((component) => !isFirstParty(component))
  .filter((component) => !component.licenses)
  .filter((component) => property(component, "vcg:license-status") !== "unresolved-model-license");
if (unknownLicenseGaps.length > 0) {
  throw new Error(
    `unreviewed third-party license gaps: ${unknownLicenseGaps.map(refOf).join(", ")}`,
  );
}
for (const blocker of unresolved) {
  if (blocker.refs.length === 0) throw new Error(`known blocker ${blocker.id} no longer matches; update the compliance policy`);
}

const sbom = {
  $schema: "https://cyclonedx.org/schema/bom-1.7.schema.json",
  bomFormat: "CycloneDX",
  specVersion: "1.7",
  serialNumber: deterministicSerial([rootComponent, ...components]),
  version: 1,
  metadata: {
    component: rootComponent,
    properties: [
      { name: "vcg:inventory-basis", value: "installed pnpm graph plus Cargo.lock and pinned runtime assets" },
      { name: "vcg:known-license-blockers", value: unresolved.map((item) => item.id).join(",") },
    ],
  },
  components,
  dependencies: [
    {
      ref: rootComponent["bom-ref"],
      dependsOn: components.map(refOf),
    },
  ],
};

const sbomText = `${JSON.stringify(sbom, null, 2)}\n`;
const noticesText = renderNotices({ components, rootComponent, unresolved });
await emit(sbomPath, sbomText);
await emit(noticesPath, noticesText);

console.log(
  `compliance inventory: ${components.length + 1} components, ${npmAll.length} npm, ${
    cargo.packages.length
  } Cargo, ${provenance.assets.length} assets`,
);
console.log(`known release blockers: ${unresolved.map((item) => `${item.id} (${item.refs.length})`).join(", ")}`);

if (release) {
  throw new Error(
    "release compliance is blocked: select the project license and record exact pose-model redistribution evidence",
  );
}

function runPnpm(args) {
  if (process.env.npm_execpath) {
    return execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  }
  return runCandidates(
    process.platform === "win32" ? ["pnpm.cmd", "pnpm"] : ["pnpm"],
    args,
  );
}

function runCargo(args) {
  const candidates = [process.env.CARGO, "cargo"];
  if (process.platform === "win32" && process.env.USERPROFILE) {
    candidates.push(resolve(process.env.USERPROFILE, ".cargo/bin/cargo.exe"));
  }
  return runCandidates(candidates.filter(Boolean), args);
}

function runCandidates(candidates, args) {
  let lastError;
  for (const command of candidates) {
    try {
      return execFileSync(command, args, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error(`unable to run ${candidates[0]}`);
}

function flattenPnpmLicenses(raw) {
  const grouped = JSON.parse(raw);
  const components = [];
  for (const [license, packages] of Object.entries(grouped)) {
    for (const packageEntry of packages) {
      for (const version of packageEntry.versions) {
        const bomRef = npmRef(packageEntry.name, version);
        components.push({
          type: "library",
          "bom-ref": bomRef,
          name: packageEntry.name,
          version,
          purl: bomRef,
          licenses: cyclonedxLicense(license),
          ...(packageEntry.author ? { author: packageEntry.author } : {}),
          ...(packageEntry.description ? { description: packageEntry.description } : {}),
          ...(packageEntry.homepage
            ? {
                externalReferences: [{ type: "website", url: packageEntry.homepage }],
              }
            : {}),
          properties: [
            { name: "vcg:ecosystem", value: "npm" },
            { name: "vcg:reported-license", value: license },
          ],
        });
      }
    }
  }
  return components;
}

function cargoComponents(metadata) {
  const workspaceIds = new Set(metadata.workspace_members);
  return metadata.packages.map((packageEntry) => {
    const firstParty = workspaceIds.has(packageEntry.id);
    const bomRef = cargoRef(packageEntry.name, packageEntry.version);
    return {
      type: firstParty ? "application" : "library",
      "bom-ref": bomRef,
      name: packageEntry.name,
      version: packageEntry.version,
      purl: bomRef,
      scope: "required",
      ...(packageEntry.description ? { description: packageEntry.description } : {}),
      ...(packageEntry.repository
        ? { externalReferences: [{ type: "vcs", url: packageEntry.repository }] }
        : {}),
      ...(packageEntry.license ? { licenses: cyclonedxLicense(packageEntry.license) } : {}),
      properties: [
        { name: "vcg:ecosystem", value: "cargo" },
        ...(firstParty
          ? [
              { name: "vcg:first-party", value: "true" },
              { name: "vcg:license-status", value: "unresolved-project-license" },
            ]
          : [{ name: "vcg:reported-license", value: packageEntry.license }]),
      ],
    };
  });
}

function workspaceComponent(workspace) {
  const bomRef = npmRef(workspace.name, workspace.version);
  return {
    type: "application",
    "bom-ref": bomRef,
    name: workspace.name,
    version: workspace.version,
    purl: bomRef,
    properties: [
      { name: "vcg:ecosystem", value: "npm-workspace" },
      { name: "vcg:first-party", value: "true" },
      { name: "vcg:license-status", value: "unresolved-project-license" },
    ],
  };
}

function assetComponents(assetProvenance) {
  return assetProvenance.assets.map((asset) => {
    const isFont = asset.name.startsWith("OCR-A");
    return {
      type: isFont ? "file" : "machine-learning-model",
      "bom-ref": `asset:${slug(asset.name)}@${asset.provenance?.version ?? "1"}`,
      name: asset.name,
      version: asset.provenance?.version ?? "1",
      hashes: [{ alg: "SHA-256", content: asset.sha256 }],
      ...(isFont ? { licenses: [{ license: { name: asset.provenance.upstreamLicenseLabel } }] } : {}),
      externalReferences: [{ type: "distribution", url: asset.url }],
      properties: [
        { name: "vcg:ecosystem", value: "pinned-asset" },
        { name: "vcg:byte-length", value: String(asset.bytes) },
        ...(isFont
          ? [{ name: "vcg:reported-license", value: asset.provenance.upstreamLicenseLabel }]
          : [{ name: "vcg:license-status", value: "unresolved-model-license" }]),
      ],
    };
  });
}

function cyclonedxLicense(reported) {
  const normalized = reported.replaceAll("MIT/Apache-2.0", "MIT OR Apache-2.0");
  return [{ expression: normalized }];
}

function npmRef(name, version) {
  const encoded = name.startsWith("@") ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${encoded}@${version}`;
}

function cargoRef(name, version) {
  return `pkg:cargo/${name}@${version}`;
}

function deterministicSerial(allComponents) {
  const digest = createHash("sha256")
    .update(allComponents.map(refOf).sort().join("\n"))
    .digest("hex");
  const variant = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  return `urn:uuid:${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function renderNotices({ components: allComponents, rootComponent: project, unresolved: blockers }) {
  const thirdParty = allComponents.filter((component) => !isFirstParty(component));
  const npm = thirdParty.filter((component) => property(component, "vcg:ecosystem") === "npm");
  const cargoPackages = thirdParty.filter((component) => property(component, "vcg:ecosystem") === "cargo");
  const assets = thirdParty.filter((component) => property(component, "vcg:ecosystem") === "pinned-asset");
  return `# Generated dependency notices

Generated by \`scripts/generate-compliance.mjs\`. Do not edit this file by hand.

This inventory records upstream package metadata; it is not legal advice and
does not replace the exact license/NOTICE files that a release bundle may need
to reproduce. The checked-in CycloneDX 1.7 companion is
\`compliance/vcg-console.cdx.json\`.

## Release blockers

${blockers
  .map((blocker) => `- **${blocker.id}:** ${blocker.refs.map((ref) => `\`${ref}\``).join(", ")}`)
  .join("\n")}

The evidence gate accepts only these named blockers and fails on any new
third-party component without reported license metadata. The release gate
fails while either blocker remains.

## Inventory summary

| Class | Components |
|---|---:|
| Project root | 1 |
| First-party subcomponents | ${allComponents.filter(isFirstParty).length} |
| npm dependencies | ${npm.length} |
| Cargo packages | ${cargoPackages.length} |
| Pinned assets | ${assets.length} |
| Total | ${allComponents.length + 1} |

## npm dependencies

| Package | Version | Scope | Reported license | Upstream |
|---|---|---|---|---|
${npm.map(noticeRow).join("\n")}

## Cargo packages

| Package | Version | Scope | Reported license | Upstream |
|---|---|---|---|---|
${cargoPackages.map(noticeRow).join("\n")}

## Pinned runtime assets

| Asset | Version | Scope | Reported license | Upstream |
|---|---|---|---|---|
${assets.map(noticeRow).join("\n")}

## Generation boundary

The npm inventory reflects packages installed for the current platform from
the frozen pnpm lockfile. Cargo uses the complete locked resolver graph. Pinned
font/model files come from \`ASSET_PROVENANCE.json\`. Target ARM64 and x86-64
release jobs must each regenerate and compare their inventory so conditional
dependencies are not hidden by a Windows development run.

The project component \`${project["bom-ref"]}\` and its first-party
subcomponents intentionally have no invented license expression.
`;
}

function noticeRow(component) {
  const license =
    component.licenses?.[0]?.expression ??
    component.licenses?.[0]?.license?.name ??
    "UNRESOLVED";
  const upstream = component.externalReferences?.[0]?.url ?? "—";
  return `| ${escapeCell(component.name)} | ${escapeCell(component.version)} | ${
    component.scope === "excluded" ? "development" : "required"
  } | ${escapeCell(license)} | ${upstream === "—" ? upstream : `<${upstream}>`} |`;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function refOf(component) {
  return component["bom-ref"];
}

function isFirstParty(component) {
  return property(component, "vcg:first-party") === "true";
}

function property(component, name) {
  return component.properties?.find((entry) => entry.name === name)?.value;
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function emit(path, content) {
  if (check) {
    let existing;
    try {
      existing = await readFile(path, "utf8");
    } catch {
      throw new Error(`${path} is missing; run pnpm prepare:compliance`);
    }
    if (existing !== content) {
      throw new Error(`${path} is stale; run pnpm prepare:compliance`);
    }
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  console.log(`wrote ${path}`);
}

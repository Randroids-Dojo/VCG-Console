#!/usr/bin/env node

import {
  ExclusionScanError,
  scanExclusionManifestFile,
} from "./device-only-data-exclusion.mjs";

async function main() {
  if (process.argv.length !== 3) {
    process.stderr.write(
      `${JSON.stringify({
        schemaVersion: 1,
        status: "error",
        code: "usage",
      })}\n`,
    );
    process.exitCode = 2;
    return;
  }
  try {
    const result = await scanExclusionManifestFile(process.argv[2]);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === "passed" ? 0 : 1;
  } catch (error) {
    const code =
      error instanceof ExclusionScanError ? error.code : "internal_error";
    process.stderr.write(
      `${JSON.stringify({
        schemaVersion: 1,
        status: "error",
        code,
      })}\n`,
    );
    process.exitCode = 2;
  }
}

await main();

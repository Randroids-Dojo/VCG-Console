import assert from "node:assert/strict";
import test from "node:test";
import { supportsNodeVersion } from "./check-node-version.cjs";

test("prerequisites enforce the exact Node minimum and reject prereleases", () => {
  for (const version of ["22.0.0", "22.11.9", "21.99.0", "22.12.0-rc.1", "garbage"]) {
    assert.equal(supportsNodeVersion(version), false, version);
  }
  for (const version of ["22.12.0", "22.12.1", "22.13.0", "24.0.0"]) {
    assert.equal(supportsNodeVersion(version), true, version);
  }
  assert.equal(supportsNodeVersion("24.0.0", ">=24.1.0"), false);
  assert.throws(() => supportsNodeVersion("24.0.0", "^22"), /Unsupported/);
});

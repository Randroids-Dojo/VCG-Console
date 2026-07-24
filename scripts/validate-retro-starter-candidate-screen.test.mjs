import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRetroStarterCandidateScreen,
} from "./generate-retro-starter-candidate-screen.mjs";
import {
  parseCanonicalRetroStarterScreen,
  RETRO_STARTER_SCREEN_MAX_BYTES,
  validateRetroStarterCandidateScreen,
  validateTrackedRetroStarterCandidateScreen,
} from "./validate-retro-starter-candidate-screen.mjs";

function clone() {
  return structuredClone(buildRetroStarterCandidateScreen());
}

function rejects(mutator, pattern) {
  const artifact = clone();
  mutator(artifact);
  assert.throws(
    () => validateRetroStarterCandidateScreen(artifact),
    pattern,
  );
}

test("accepts the exact blocked six-candidate screen", async () => {
  const artifact = await validateTrackedRetroStarterCandidateScreen();
  assert.equal(artifact.summary.candidateCount, 6);
  assert.equal(artifact.summary.admittedCount, 0);
});

test("rejects admission or production mutation promotion", () => {
  rejects(
    (artifact) => {
      artifact.candidates[5].admissionStatus = "admitted";
      artifact.summary.admittedCount = 1;
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.policy.productionCatalogMutation = true;
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.summary.packageMutationCount = 1;
    },
    /exact reviewed/u,
  );
});

test("rejects source identity or evidence URL substitution", () => {
  rejects(
    (artifact) => {
      artifact.candidates[0].observedRevision = "0".repeat(40);
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.candidates[4].upstreamRepository =
        "https://example.test/lutro-snake";
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.candidates[1].evidenceUrls.pop();
    },
    /exact reviewed/u,
  );
});

test("rejects weakened code, content, or trademark findings", () => {
  rejects(
    (artifact) => {
      artifact.candidates[0].codeRights.status =
        "explicit-permissive-license";
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.candidates[1].contentRights.expression = "MIT";
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.candidates[5].trademarkStatus = "cleared";
    },
    /exact reviewed/u,
  );
});

test("rejects hidden artifact, dependency, or architecture gaps", () => {
  rejects(
    (artifact) => {
      artifact.candidates[3].artifactStatus = "release-qualified";
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.candidates[5].dependencyStatus = "complete";
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.candidates[2].architectureStatus = "qualified";
    },
    /exact reviewed/u,
  );
});

test("rejects blocker or required-gate removal", () => {
  rejects(
    (artifact) => {
      artifact.policy.requiredGates.pop();
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.candidates[1].blockerCodes.splice(2, 1);
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.policy.categoryLabelsGrantNoAuthority = false;
    },
    /exact reviewed/u,
  );
});

test("rejects summary, limitation, date, or unknown-field drift", () => {
  rejects(
    (artifact) => {
      artifact.summary.sourceLicenseDocumentCount += 1;
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.limitations.pop();
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.evidenceDate = "2026-07-25";
    },
    /exact reviewed/u,
  );
  rejects(
    (artifact) => {
      artifact.claimedRightsCleared = true;
    },
    /exact reviewed/u,
  );
});

test("requires bounded canonical UTF-8 JSON", () => {
  const artifact = buildRetroStarterCandidateScreen();
  const canonical = new TextEncoder().encode(
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  assert.deepEqual(parseCanonicalRetroStarterScreen(canonical), artifact);
  assert.throws(
    () =>
      parseCanonicalRetroStarterScreen(
        new TextEncoder().encode(JSON.stringify(artifact)),
      ),
    /canonical/u,
  );
  assert.throws(
    () =>
      parseCanonicalRetroStarterScreen(
        new Uint8Array(RETRO_STARTER_SCREEN_MAX_BYTES + 1),
      ),
    /byte size/u,
  );
  assert.throws(
    () => parseCanonicalRetroStarterScreen(new Uint8Array([0xff])),
  );
});

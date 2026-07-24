import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalJsonSha256,
  validateRgbDepthFloorContactPlan,
  validateRgbDepthFloorContactResult,
} from "./validate-rgb-depth-floor-contact-campaign.mjs";

const planPath =
  "benchmarks/floor-contact/rgb-depth-floor-contact-plan-v1.json";

async function planFixture() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

function digest(character) {
  return character.repeat(64);
}

function perfectMetric(eventType, attempts) {
  return {
    eventType,
    counts: {
      reference: attempts,
      predicted: attempts,
      matched: attempts,
      missed: 0,
      spurious: 0,
    },
    precision: 1,
    recall: 1,
    signedErrorMs: {
      count: attempts,
      mean: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      minimum: 0,
      maximum: 0,
      worstAbsolute: 0,
    },
  };
}

function perfectResult(plan) {
  const participantIds = {
    "school-age-child-standing": "session-child-0001",
    "adult-standing": "session-adult-0001",
  };
  const allEventTypes = plan.matrix.movementBlocks.flatMap(
    ({ eventTypes }) => eventTypes,
  );
  return {
    format: plan.format,
    formatVersion: plan.formatVersion,
    documentType: "result",
    campaignId: plan.campaignId,
    generatedAt: "2026-07-24T20:00:00.000Z",
    sourceCommit: plan.sourceCommit,
    plan: {
      path: planPath,
      canonicalSha256: canonicalJsonSha256(plan),
    },
    execution: {
      startedAt: "2026-07-24T18:00:00.000Z",
      completedAt: "2026-07-24T19:00:00.000Z",
      configurationSha256: digest("1"),
      roomSheetSha256: digest("2"),
      consentRecordSetSha256: digest("3"),
      rgbDevice: {
        identity: "fixture RGB device",
        configurationSha256: digest("4"),
      },
      depthDevice: {
        identity: "fixture depth device",
        configurationSha256: digest("5"),
      },
      contactDevice: {
        identity: "fixture contact reference",
        configurationSha256: digest("6"),
      },
      host: {
        identity: "fixture host and clock",
        configurationSha256: digest("7"),
      },
      synchronization: {
        maximumMeasuredErrorMs: 1,
        maximumReferenceUncertaintyMs: 2,
        beforeAfterEverySession: true,
      },
      participants: Object.entries(participantIds).map(
        ([personaClass, participantSessionId]) => ({
          participantSessionId,
          personaClass,
        }),
      ),
      rawFramesRetained: false,
    },
    cells: plan.matrix.cells.map((cell) => ({
      cellId: cell.cellId,
      participantSessionId: participantIds[cell.personaClass],
      scheduledAttempts: cell.scheduledAttempts,
      validAttempts: cell.scheduledAttempts,
      invalidAttempts: 0,
      invalidReasons: [],
      configurationSha256: digest("8"),
      skeletonTraceSha256: digest("9"),
      depthLabelsSha256: digest("a"),
      contactLabelsSha256: digest("b"),
      strategies: plan.configuration.rgbStrategies.map((strategy) => ({
        strategy,
        events: cell.eventTypes.map((eventType) =>
          perfectMetric(eventType, cell.scheduledAttempts),
        ),
      })),
    })),
    negativeWindows: plan.matrix.personaClasses.flatMap((personaClass) =>
      plan.matrix.cameraPositions.map((cameraPosition) => ({
        windowId: `${personaClass}--${cameraPosition}--negative`,
        participantSessionId: participantIds[personaClass],
        durationSeconds:
          plan.matrix.negativeWindowSecondsPerPersonaPosition,
        configurationSha256: digest("c"),
        skeletonTraceSha256: digest("d"),
        strategies: plan.configuration.rgbStrategies.map((strategy) => ({
          strategy,
          falseEvents: allEventTypes.map((eventType) => ({
            eventType,
            count: 0,
          })),
        })),
      })),
    ),
    summary: {
      scheduledAttempts: 600,
      validAttempts: 600,
      invalidAttempts: 0,
      movementCells: 30,
      negativeWindows: 10,
      negativeSeconds: 600,
      falseEvents: 0,
      synchronizationPassed: true,
      selectionEligible: false,
    },
    claimBoundary:
      "The event-timing gate remains unset; this is not strategy selection and not target qualification.",
    limitations: [
      "Fixture values are synthetic.",
      "No participant ran.",
      "No camera ran.",
      "No depth device ran.",
      "No contact reference ran.",
    ],
  };
}

test("accepts the pinned complete plan", async () => {
  const plan = await planFixture();
  assert.equal(validateRgbDepthFloorContactPlan(plan), plan);
  assert.equal(plan.matrix.cells.length, 30);
  assert.equal(plan.matrix.scheduledMovementAttempts, 600);
  assert.equal(plan.matrix.scheduledNegativeWindows, 10);
});

test("accepts a complete result shape but refuses selection before Q-235", async () => {
  const plan = await planFixture();
  const result = perfectResult(plan);
  assert.equal(validateRgbDepthFloorContactResult(result, plan), result);
  assert.equal(result.summary.selectionEligible, false);
});

test("rejects a missing matrix cell", async () => {
  const plan = await planFixture();
  const result = perfectResult(plan);
  result.cells.pop();
  assert.throws(
    () => validateRgbDepthFloorContactResult(result, plan),
    /complete 30-cell matrix/,
  );
});

test("rejects capture-arrival time as RGB exposure proof", async () => {
  const plan = await planFixture();
  plan.configuration.timestamps.rgbTimestamp = "capture-arrival timestamp";
  assert.throws(
    () => validateRgbDepthFloorContactPlan(plan),
    /reject arrival-only timing/,
  );
});

test("rejects depth-only foot-contact truth", async () => {
  const plan = await planFixture();
  plan.configuration.reference.depthAloneQualifiesContactTruth = true;
  assert.throws(
    () => validateRgbDepthFloorContactPlan(plan),
    /depthAloneQualifiesContactTruth/,
  );
});

test("rejects retained raw frames", async () => {
  const plan = await planFixture();
  const result = perfectResult(plan);
  result.execution.rawFramesRetained = true;
  assert.throws(
    () => validateRgbDepthFloorContactResult(result, plan),
    /rawFramesRetained/,
  );
});

test("rejects plan substitution", async () => {
  const plan = await planFixture();
  const result = perfectResult(plan);
  result.plan.canonicalSha256 = digest("e");
  assert.throws(
    () => validateRgbDepthFloorContactResult(result, plan),
    /canonicalSha256/,
  );
});

test("rejects hidden misses and spurious events", async () => {
  const plan = await planFixture();
  const result = perfectResult(plan);
  result.cells[0].strategies[0].events[0].counts.matched = 19;
  assert.throws(
    () => validateRgbDepthFloorContactResult(result, plan),
    /counts.missed/,
  );
});

test("recomputes synchronization instead of trusting the summary", async () => {
  const plan = await planFixture();
  const result = perfectResult(plan);
  result.execution.synchronization.maximumMeasuredErrorMs = 6;
  assert.throws(
    () => validateRgbDepthFloorContactResult(result, plan),
    /summary.synchronizationPassed/,
  );
});

test("rejects aggregate-only participant substitution", async () => {
  const plan = await planFixture();
  const result = perfectResult(plan);
  result.cells[0].participantSessionId = "session-adult-0001";
  assert.throws(
    () => validateRgbDepthFloorContactResult(result, plan),
    /participant persona/,
  );
});

test("rejects undeclared result fields", async () => {
  const plan = await planFixture();
  const result = perfectResult(plan);
  result.depthWins = true;
  assert.throws(
    () => validateRgbDepthFloorContactResult(result, plan),
    /result keys must be exactly/,
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parsePiAcceleratorQuoteComparisonBytes,
  validatePiAcceleratorQuoteComparison,
} from "./validate-pi-accelerator-quote-comparison.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(
  resolve(root, "benchmarks/hardware-quotes/pi5-ai-hat-same-date-quote-v1.json"),
);
const tracked = await parsePiAcceleratorQuoteComparisonBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked same-date comparison without a delivered quote", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.variants.length, 3);
  assert.equal(tracked.result.completeDeliveredQuotes, 0);
  assert.equal(tracked.result.purchaseAuthorized, false);
});

test("rejects source-boundary substitution", async () => {
  const quote = clone();
  quote.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validatePiAcceleratorQuoteComparison(quote), /digest drifted/u);
});

test("rejects shared BOM omission, reorder, identity substitution, or price drift", async () => {
  for (const mutate of [
    (quote) => { quote.sharedBom.lines.pop(); },
    (quote) => { quote.sharedBom.lines.reverse(); },
    (quote) => { quote.sharedBom.lines[0].identifier = "unknown Pi 5"; },
    (quote) => { quote.sharedBom.lines[6].priceUsd = 0; },
  ]) {
    const quote = clone();
    mutate(quote);
    await assert.rejects(validatePiAcceleratorQuoteComparison(quote));
  }
});

test("rejects HAT identity, seller SKU, status, architecture, or price substitution", async () => {
  for (const mutate of [
    (quote) => { quote.variants[0].manufacturerIdentifiersAsListed.pop(); },
    (quote) => { quote.variants[1].sellerSku = "replacement"; },
    (quote) => { quote.approvedResellerEvidence.status = "seller-self-claimed"; },
    (quote) => { quote.variants[2].observedStatus = "in-stock"; },
    (quote) => { quote.variants[2].acceleratorArchitecture = "Hailo-8"; },
    (quote) => { quote.variants[2].observedPriceUsd = 130; },
  ]) {
    const quote = clone();
    mutate(quote);
    await assert.rejects(validatePiAcceleratorQuoteComparison(quote));
  }
});

test("rejects subtotal, headroom, overage, or baseline-delta arithmetic drift", async () => {
  for (const mutate of [
    (quote) => { quote.variants[0].merchandiseSubtotalUsd += 0.01; },
    (quote) => { quote.variants[1].maximumShippingAndTaxUsd += 0.01; },
    (quote) => { quote.variants[2].minimumPreDeliveryCapOverageUsd = 0; },
    (quote) => { quote.variants[2].deltaVs26SubtotalUsd = 80; },
  ]) {
    const quote = clone();
    mutate(quote);
    await assert.rejects(validatePiAcceleratorQuoteComparison(quote));
  }
});

test("rejects invented destination, delivery, purchase, qualification, or selection state", async () => {
  for (const mutate of [
    (quote) => { quote.budget.destinationZip = "00000"; },
    (quote) => { quote.variants[0].shippingUsd = 0; },
    (quote) => { quote.variants[1].deliveredTotalUsd = 576.23; },
    (quote) => { quote.result.purchaseAuthorized = true; },
    (quote) => { quote.comparisonPolicy.physicalQualificationComplete = true; },
    (quote) => { quote.comparisonPolicy.selectedVariantId = "ai-hat-plus-13"; },
  ]) {
    const quote = clone();
    mutate(quote);
    await assert.rejects(validatePiAcceleratorQuoteComparison(quote));
  }
});

test("rejects weakened 40 TOPS price, cap, or computer-vision claim boundary", async () => {
  for (const mutate of [
    (quote) => { quote.officialProductEvidence.observedPriceUsd = 130; },
    (quote) => { quote.variants[2].deliveredCapDisposition = "passes"; },
    (quote) => { quote.variants[2].computerVisionPerformanceClaim = "faster than 26 TOPS"; },
    (quote) => { quote.comparisonPolicy.fortyTopsAdvertisedNumberMayImplyFasterComputerVision = true; },
  ]) {
    const quote = clone();
    mutate(quote);
    await assert.rejects(validatePiAcceleratorQuoteComparison(quote));
  }
});

test("rejects blocker, result, and undeclared-field drift", async () => {
  const blockers = clone();
  blockers.blockerCodes.reverse();
  await assert.rejects(validatePiAcceleratorQuoteComparison(blockers));
  const result = clone();
  result.result.completeDeliveredQuotes = 1;
  await assert.rejects(validatePiAcceleratorQuoteComparison(result));
  const extra = clone();
  extra.recommendation = "buy";
  await assert.rejects(validatePiAcceleratorQuoteComparison(extra), /fields drifted/u);
});

test("rejects noncanonical, duplicate-key, BOM, invalid UTF-8, and oversized bytes", async () => {
  await assert.rejects(
    parsePiAcceleratorQuoteComparisonBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parsePiAcceleratorQuoteComparisonBytes(duplicate), /canonical/u);
  await assert.rejects(
    parsePiAcceleratorQuoteComparisonBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
  );
  await assert.rejects(
    parsePiAcceleratorQuoteComparisonBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parsePiAcceleratorQuoteComparisonBytes(Buffer.alloc(96 * 1024 + 1)),
  );
});

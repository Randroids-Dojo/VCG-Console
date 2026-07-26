import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/hardware-quotes/pi5-ai-hat-same-date-quote-v1.json",
);
const MAX_BYTES = 96 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const PI_ACCELERATOR_QUOTE_FORMAT =
  "vcg-pi-accelerator-quote-comparison/v1";
export const PI_ACCELERATOR_QUOTE_BLOCKERS = Object.freeze([
  "destination-specific-shipping-and-tax",
  "exact-manufacturer-identifier-aliases",
  "camera-and-mount-qualification",
  "received-hardware-and-paper-compatibility-inspection",
  "accelerator-runtime-and-workload-qualification",
  "pre-registered-value-gates-and-selection-decision",
]);

const topKeys = [
  "format",
  "status",
  "quoteId",
  "observedAt",
  "currency",
  "market",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "budget",
  "sharedBom",
  "variants",
  "officialProductEvidence",
  "approvedResellerEvidence",
  "comparisonPolicy",
  "blockerCodes",
  "result",
];
const sharedLineKeys = [
  "role",
  "item",
  "seller",
  "sellerUrl",
  "identifier",
  "observedStatus",
  "priceUsd",
];
const variantKeys = [
  "variantId",
  "product",
  "acceleratorArchitecture",
  "advertisedTops",
  "seller",
  "sellerUrl",
  "sellerSku",
  "manufacturerIdentifiersAsListed",
  "observedStatus",
  "observedPriceUsd",
  "includedHardware",
  "paperCompatibility",
  "computerVisionPerformanceClaim",
  "merchandiseSubtotalUsd",
  "maximumShippingAndTaxUsd",
  "minimumPreDeliveryCapOverageUsd",
  "deltaVs26SubtotalUsd",
  "shippingUsd",
  "taxUsd",
  "deliveredTotalUsd",
  "deliveredCapDisposition",
];

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function moneyCents(value, label) {
  assert.equal(typeof value, "number", `${label} must be a number`);
  assert.ok(Number.isFinite(value), `${label} must be finite`);
  const cents = Math.round(value * 100);
  assert.equal(value, cents / 100, `${label} must have at most two decimal places`);
  return cents;
}

function normalizedDigest(bytes, label) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return createHash("sha256")
    .update(text.replaceAll("\r\n", "\n"))
    .digest("hex");
}

async function validateSourceBindings(bindings, repositoryRoot) {
  const expected = [
    ["complete-reference-bom-boundary", "docs/QUOTE_DATE_BOMS_2026-07-24.md"],
    [
      "accelerator-selection-boundary",
      "benchmarks/hailo-accelerator/ai-hat-13-26-comparison-plan-v1.json",
    ],
  ];
  assert.equal(bindings.length, expected.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expected[index]);
    assert.match(binding.sha256, SHA256);
    assert.equal(
      normalizedDigest(await readFile(resolve(repositoryRoot, binding.path)), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validatePiAcceleratorQuoteComparison(
  quote,
  repositoryRoot = root,
) {
  assert.ok(quote && typeof quote === "object" && !Array.isArray(quote));
  exactKeys(quote, topKeys, "quote");
  assert.equal(quote.format, PI_ACCELERATOR_QUOTE_FORMAT);
  assert.equal(quote.status, "blocked");
  assert.equal(quote.quoteId, "pi5-ai-hat-13-26-40-us-2026-07-25");
  assert.equal(quote.observedAt, "2026-07-25T20:06:16-07:00");
  assert.equal(quote.currency, "USD");
  assert.equal(quote.market, "United States");
  assert.match(quote.claimBoundary, /^Same-date public item-page observation only/u);
  for (const forbiddenClaim of [
    "No cart",
    "physical fit test",
    "runtime test",
    "delivered total",
    "purchase authority",
    "accelerator selection",
  ]) assert.match(quote.claimBoundary, new RegExp(forbiddenClaim, "u"));
  assert.equal(
    quote.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSourceBindings(quote.sourceBindings, repositoryRoot);

  exactKeys(
    quote.budget,
    [
      "completeDeliveredCeilingUsd",
      "destinationState",
      "destinationZip",
      "taxExempt",
      "purchaseAuthorized",
    ],
    "budget",
  );
  assert.equal(moneyCents(quote.budget.completeDeliveredCeilingUsd, "budget ceiling"), 65000);
  assert.equal(quote.budget.destinationState, null);
  assert.equal(quote.budget.destinationZip, null);
  assert.equal(quote.budget.taxExempt, null);
  assert.equal(quote.budget.purchaseAuthorized, false);

  exactKeys(quote.sharedBom, ["merchandiseSubtotalUsd", "lines"], "sharedBom");
  const expectedSharedLines = [
    ["compute", "Raspberry Pi 5 8GB", "PiShop.us", "SC1112; PiShop SKU 8GB-9028", 17500],
    ["cooling", "Raspberry Pi Active Cooler", "PiShop.us", "SC1148; PiShop SKU 374-1", 1095],
    ["enclosure", "HighPi Pro 5S Case for Raspberry Pi 5", "PiShop.us", "PiShop SKU 9015; UPC 990317300194", 1095],
    ["power", "Raspberry Pi 27W USB-C Power Supply, black US", "PiShop.us", "SC1158; PiShop SKU 1795-1; UPC 5056561803395", 1295],
    ["display-cable", "Cableshop.ca micro-HDMI to HDMI cable", "PiShop.us", "PiShop SKU CS-PID-301", 645],
    ["writable-storage", "SanDisk 256GB High Endurance microSDXC", "B&H Photo Video", "SDSQQNR-256G-AN6IA; B&H SAMSDHE256GB", 6999],
    ["shared-rgb-camera", "Logitech Brio Pro", "Staples", "960-001105; Staples item 2705146", 16999],
  ];
  assert.equal(quote.sharedBom.lines.length, expectedSharedLines.length);
  let sharedSubtotalCents = 0;
  for (const [index, line] of quote.sharedBom.lines.entries()) {
    exactKeys(line, sharedLineKeys, `sharedBom.lines[${index}]`);
    const expected = expectedSharedLines[index];
    assert.deepEqual(
      [line.role, line.item, line.seller, line.identifier],
      expected.slice(0, 4),
    );
    assert.match(line.sellerUrl, /^https:\/\//u);
    assert.match(line.observedStatus, /2026-07-25/u);
    const priceCents = moneyCents(line.priceUsd, `${line.role} price`);
    assert.equal(priceCents, expected[4]);
    sharedSubtotalCents += priceCents;
  }
  assert.equal(sharedSubtotalCents, 45628);
  assert.equal(
    moneyCents(quote.sharedBom.merchandiseSubtotalUsd, "shared subtotal"),
    sharedSubtotalCents,
  );

  const expectedVariants = [
    {
      identity: ["ai-hat-plus-13", "Raspberry Pi AI HAT+ 13 TOPS", "Hailo-8L", 13, "1129-1"],
      identifiers: ["SC1676", "SC1785", "SC1430"],
      status: "in-stock",
      price: 7695,
      subtotal: 53323,
      headroom: 11677,
      overage: 0,
      delta: -4300,
      disposition: "blocked-pending-destination-quote",
    },
    {
      identity: ["ai-hat-plus-26", "Raspberry Pi AI HAT+ 26 TOPS", "Hailo-8", 26, "1243-1"],
      identifiers: ["SC1791", "SC1468"],
      status: "in-stock",
      price: 11995,
      subtotal: 57623,
      headroom: 7377,
      overage: 0,
      delta: 0,
      disposition: "blocked-pending-destination-quote",
    },
    {
      identity: ["ai-hat-plus-2-40", "Raspberry Pi AI HAT+ 2 40 TOPS", "Hailo-10H", 40, "1435-1"],
      identifiers: ["SC2166"],
      status: "in-stock-ships-in-2-to-3-business-days-due-to-high-demand",
      price: 20000,
      subtotal: 65628,
      headroom: 0,
      overage: 628,
      delta: 8005,
      disposition: "fails-cap-before-shipping-and-tax",
    },
  ];
  assert.equal(quote.variants.length, expectedVariants.length);
  for (const [index, variant] of quote.variants.entries()) {
    exactKeys(variant, variantKeys, `variants[${index}]`);
    const expected = expectedVariants[index];
    assert.deepEqual(
      [
        variant.variantId,
        variant.product,
        variant.acceleratorArchitecture,
        variant.advertisedTops,
        variant.sellerSku,
      ],
      expected.identity,
    );
    assert.equal(variant.seller, "PiShop.us");
    assert.match(variant.sellerUrl, /^https:\/\/www\.pishop\.us\/product\//u);
    assert.deepEqual(variant.manufacturerIdentifiersAsListed, expected.identifiers);
    assert.equal(variant.observedStatus, expected.status);
    const priceCents = moneyCents(variant.observedPriceUsd, `${variant.variantId} price`);
    assert.equal(priceCents, expected.price);
    assert.match(variant.includedHardware, /16mm stacking header, spacers, and screws/u);
    assert.match(variant.paperCompatibility, /Pi 5/u);
    assert.match(variant.paperCompatibility, /Active Cooler/u);
    assert.equal(
      moneyCents(variant.merchandiseSubtotalUsd, `${variant.variantId} subtotal`),
      expected.subtotal,
    );
    assert.equal(expected.subtotal, sharedSubtotalCents + priceCents);
    assert.equal(
      moneyCents(variant.maximumShippingAndTaxUsd, `${variant.variantId} headroom`),
      expected.headroom,
    );
    assert.equal(
      moneyCents(variant.minimumPreDeliveryCapOverageUsd, `${variant.variantId} overage`),
      expected.overage,
    );
    assert.equal(
      moneyCents(variant.deltaVs26SubtotalUsd, `${variant.variantId} delta`),
      expected.delta,
    );
    assert.equal(variant.shippingUsd, null);
    assert.equal(variant.taxUsd, null);
    assert.equal(variant.deliveredTotalUsd, null);
    assert.equal(variant.deliveredCapDisposition, expected.disposition);
  }
  assert.equal(quote.variants[0].computerVisionPerformanceClaim, null);
  assert.equal(quote.variants[1].computerVisionPerformanceClaim, null);
  assert.match(quote.variants[2].computerVisionPerformanceClaim, /comparable to the 26 TOPS/u);

  exactKeys(
    quote.officialProductEvidence,
    [
      "url",
      "observedPriceUsd",
      "advertisedTops",
      "numericPrecision",
      "onboardRamGb",
      "computerVisionPerformanceClaim",
      "includedHardware",
    ],
    "officialProductEvidence",
  );
  assert.deepEqual(quote.officialProductEvidence, {
    url: "https://www.raspberrypi.com/products/ai-hat-plus-2/?pubDate=20260413",
    observedPriceUsd: 200,
    advertisedTops: 40,
    numericPrecision: "INT4",
    onboardRamGb: 8,
    computerVisionPerformanceClaim: "comparable to Raspberry Pi AI HAT+ 26 TOPS",
    includedHardware: "optional heatsink, 16mm stacking header, spacers, and screws",
  });

  assert.deepEqual(quote.approvedResellerEvidence, {
    directoryUrl: "https://www.raspberrypi.com/resellers/?country=1&q=usa",
    seller: "PiShop.us",
    officialLinkUrl: "https://www.pishop.us/product-category/raspberry-pi/",
    observedAt: "2026-07-25T20:06:16-07:00",
    status: "listed-by-raspberry-pi",
  });

  assert.deepEqual(quote.comparisonPolicy, {
    sharedLineSubstitutionAllowed: false,
    variantOnlyChangesHat: true,
    currentBaselineVariantId: "ai-hat-plus-26",
    selectedVariantId: null,
    automaticSelectionAllowed: false,
    physicalQualificationComplete: false,
    runtimeQualificationComplete: false,
    fortyTopsAdvertisedNumberMayImplyFasterComputerVision: false,
  });
  assert.deepEqual(quote.blockerCodes, [...PI_ACCELERATOR_QUOTE_BLOCKERS]);
  assert.deepEqual(quote.result, {
    completeDeliveredQuotes: 0,
    variantsWithinMerchandiseCeiling: 2,
    variantsFailingBeforeDelivery: 1,
    purchaseRecommended: false,
    purchaseAuthorized: false,
    selectedVariantId: null,
  });
  return quote;
}

export async function parsePiAcceleratorQuoteComparisonBytes(
  bytes,
  repositoryRoot = root,
) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Pi accelerator quote comparison must be valid UTF-8");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Pi accelerator quote comparison must be valid JSON");
  }
  await validatePiAcceleratorQuoteComparison(value, repositoryRoot);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "Pi accelerator quote comparison must use canonical two-space JSON with one trailing newline",
  );
  return value;
}

export async function validateTrackedPiAcceleratorQuoteComparison() {
  return parsePiAcceleratorQuoteComparisonBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const quote = await validateTrackedPiAcceleratorQuoteComparison();
  console.log(
    `Pi accelerator quote comparison valid: variants=${quote.variants.length} completeDeliveredQuotes=${quote.result.completeDeliveredQuotes} preDeliveryFailures=${quote.result.variantsFailingBeforeDelivery}`,
  );
}

import assert from "node:assert/strict";
import test from "node:test";

import { createTransportPayloadCodec } from "./motion-transport-payload.mjs";

test("opaque payloads remain fixed, deterministic, and bounded by the caller", () => {
  const first = createTransportPayloadCodec("opaque-bytes", 4_096);
  const second = createTransportPayloadCodec("opaque-bytes", 4_096);

  assert.equal(first.referencePayload.byteLength, 4_096);
  assert.deepEqual(first.referencePayload, second.referencePayload);
  assert.equal(first.encode(), first.referencePayload);
  assert.doesNotThrow(() => first.verify(Buffer.from(first.referencePayload)));
  assert.throws(() => first.verify(Buffer.alloc(4_096)), /opaque response mismatch/);
  assert.deepEqual(first.metadata, {
    payloadMode: "opaque-bytes",
    serialization: "none",
    schemaValidation: false,
    producerSchemaValidation: false,
    consumerSchemaValidation: false,
  });
});

test("Motion JSON performs a stable full-frame round trip with validation", () => {
  const codec = createTransportPayloadCodec("motion-json", 123);
  const first = codec.encode();
  const second = codec.encode();

  assert.deepEqual(first, second);
  assert.equal(first.byteLength, codec.referencePayload.byteLength);
  assert.doesNotThrow(() => codec.verify(first));
  assert.deepEqual(codec.metadata, {
    payloadMode: "motion-json",
    serialization: "json-utf8",
    schemaValidation: true,
    producerSchemaValidation: true,
    consumerSchemaValidation: true,
    motionApiVersion: "0.3.0",
    frameShape: "one synthetic candidate with body.core17 landmarks and no actions",
  });
});

test("Motion JSON rejects malformed and schema-invalid responses", () => {
  const codec = createTransportPayloadCodec("motion-json", 4_096);
  assert.throws(() => codec.verify(Buffer.from("{", "utf8")), SyntaxError);

  const changed = JSON.parse(codec.referencePayload.toString("utf8"));
  changed.players[0].coreLandmarks.pop();
  assert.throws(
    () => codec.verify(Buffer.from(JSON.stringify(changed), "utf8")),
    /Too small|expected array to have >=17 items/i,
  );
});

test("unknown payload modes fail closed", () => {
  assert.throws(
    () => createTransportPayloadCodec("compressed-binary", 4_096),
    /payload-mode must be opaque-bytes or motion-json/,
  );
});

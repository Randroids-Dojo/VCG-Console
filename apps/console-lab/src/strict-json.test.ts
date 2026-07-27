import { describe, expect, it } from "vitest";
import {
  MAX_JSON_CONTAINER_DEPTH,
  parseJsonWithUniqueObjectFields,
} from "./strict-json";

describe("strict JSON object fields", () => {
  it("accepts ordinary JSON whitespace, ordering, and the exact nesting limit", () => {
    const nested = `${"[".repeat(MAX_JSON_CONTAINER_DEPTH)}0${"]".repeat(MAX_JSON_CONTAINER_DEPTH)}`;
    expect(parseJsonWithUniqueObjectFields(' { "second": [true, null], "first": 1 } ')).toEqual({
      second: [true, null],
      first: 1,
    });
    expect(parseJsonWithUniqueObjectFields(nested)).toBeDefined();
  });

  it("rejects direct, nested, and escaped-alias duplicate object fields", () => {
    for (const text of [
      '{"name":1,"name":2}',
      '[{"name":1,"name":2}]',
      '{"name":1,"\\u006eame":2}',
    ]) {
      expect(() => parseJsonWithUniqueObjectFields(text)).toThrow(/duplicate object field/u);
    }
  });

  it("rejects container nesting beyond the fixed limit", () => {
    const excessive = `${"[".repeat(MAX_JSON_CONTAINER_DEPTH + 1)}0${"]".repeat(MAX_JSON_CONTAINER_DEPTH + 1)}`;
    expect(() => parseJsonWithUniqueObjectFields(excessive)).toThrow(/nesting limit/u);
  });

  it("preserves malformed JSON rejection", () => {
    for (const text of ["", "{", "[1,]", '{"key" 1}', '"unterminated']) {
      expect(() => parseJsonWithUniqueObjectFields(text)).toThrow();
    }
  });
});

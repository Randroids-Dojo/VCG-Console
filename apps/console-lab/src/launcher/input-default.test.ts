import { describe, expect, it } from "vitest";
import {
  INPUT_DEFAULT_STORAGE_KEY,
  InputDefaultController,
} from "./input-default";

function storage(initial?: string) {
  const items = new Map<string, string>();
  if (initial !== undefined) items.set(INPUT_DEFAULT_STORAGE_KEY, initial);
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("InputDefaultController", () => {
  it("starts the camera when nobody has chosen", () => {
    const controller = new InputDefaultController(storage());

    expect(controller.value).toBe("motion");
    expect(controller.startsCamera).toBe(true);
  });

  it("keeps the camera closed when the console is set to controller", () => {
    const store = storage();
    const controller = new InputDefaultController(store);

    controller.set("controller");

    expect(controller.startsCamera).toBe(false);
    expect(new InputDefaultController(store).value).toBe("controller");
  });

  it("falls back to motion rather than trusting damaged storage", () => {
    for (const damaged of ["", "{", "null", '{"input":"laser"}', '{"input":5}']) {
      expect(new InputDefaultController(storage(damaged)).value).toBe("motion");
    }
  });

  it("ignores an oversized record instead of parsing it", () => {
    const oversized = JSON.stringify({ input: "controller", pad: "x".repeat(400) });

    expect(new InputDefaultController(storage(oversized)).value).toBe("motion");
  });

  it("stays usable when storage refuses to read or write", () => {
    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    const controller = new InputDefaultController(blocked);

    expect(controller.value).toBe("motion");
    expect(controller.set("controller")).toBe("controller");
    expect(controller.startsCamera).toBe(false);
  });
});

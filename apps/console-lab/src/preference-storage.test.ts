import { afterEach, describe, expect, it } from "vitest";
import { preferenceStorage } from "./preference-storage";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function replaceLocalStorage(get: () => Storage): void {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("preferenceStorage", () => {
  it("hands back the browser's store when it works", () => {
    const store = { length: 0, clear() {}, getItem: () => "kept", key: () => null, removeItem() {}, setItem() {} };
    replaceLocalStorage(() => store as unknown as Storage);

    expect(preferenceStorage().getItem("anything")).toBe("kept");
  });

  it("survives a store that throws on access", () => {
    replaceLocalStorage(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(preferenceStorage().getItem("anything")).toBeNull();
  });

  it("survives a store that answers and then throws on use", () => {
    replaceLocalStorage(() =>
      new Proxy({} as Storage, {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      })
    );

    const storage = preferenceStorage();
    expect(storage.getItem("anything")).toBeNull();
    expect(() => storage.setItem("anything", "value")).not.toThrow();
  });
});

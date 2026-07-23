import { describe, expect, it } from "vitest";
import { createPlayerRelativeBasis, imageToFloor, imageToPlayerRelative, playerRelativeToImage } from "../src/coordinates";

describe("coordinate transforms", () => {
  it("creates a translation- and scale-independent player frame", () => {
    const basis = createPlayerRelativeBasis({
      leftHip: { x: 0.4, y: 0.7 },
      rightHip: { x: 0.6, y: 0.7 },
      leftShoulder: { x: 0.4, y: 0.3 },
      rightShoulder: { x: 0.6, y: 0.3 },
    });
    expect(imageToPlayerRelative({ x: 0.5, y: 0.7 }, basis)).toEqual({ x: 0, y: 0 });
    expect(imageToPlayerRelative({ x: 0.5, y: 0.3 }, basis)).toEqual({ x: 0, y: 1 });
    const right = imageToPlayerRelative({ x: 0.7, y: 0.7 }, basis);
    expect(right.x).toBeCloseTo(0.5, 12);
    expect(right.y).toBe(0);
  });

  it("orthogonalizes a rolled body and round-trips points", () => {
    const basis = createPlayerRelativeBasis({
      leftHip: { x: 0.3, y: 0.6 },
      rightHip: { x: 0.5, y: 0.8 },
      leftShoulder: { x: 0.5, y: 0.4 },
      rightShoulder: { x: 0.7, y: 0.6 },
    });
    const imagePoint = { x: 0.8, y: 0.2 };
    const playerPoint = imageToPlayerRelative(imagePoint, basis);
    const restored = playerRelativeToImage(playerPoint, basis);
    expect(restored.x).toBeCloseTo(imagePoint.x, 12);
    expect(restored.y).toBeCloseTo(imagePoint.y, 12);
    expect(basis.xAxis.x * basis.yAxis.x + basis.xAxis.y * basis.yAxis.y).toBeCloseTo(0, 12);
  });

  it("rejects degenerate player anchors", () => {
    expect(() => createPlayerRelativeBasis({
      leftHip: { x: 0.5, y: 0.5 },
      rightHip: { x: 0.5, y: 0.5 },
      leftShoulder: { x: 0.5, y: 0.5 },
      rightShoulder: { x: 0.5, y: 0.5 },
    })).toThrow(/degenerate/);
  });

  it("projects normalized image points into a calibrated floor plane", () => {
    const floor = imageToFloor(
      { x: 0.25, y: 0.5 },
      [4, 0, -2, 0, 6, -1, 0, 0, 1],
    );
    expect(floor).toEqual({ xMeters: -1, zMeters: 2 });
  });

  it("applies perspective division and rejects points at infinity", () => {
    expect(imageToFloor({ x: 1, y: 0 }, [2, 0, 0, 0, 2, 0, 1, 0, 1])).toEqual({ xMeters: 1, zMeters: 0 });
    expect(() => imageToFloor({ x: 1, y: 0 }, [1, 0, 0, 0, 1, 0, 1, 0, -1])).toThrow(/infinity/);
  });

  it("rejects malformed public transform inputs", () => {
    const malformedBasis = {
      origin: { x: Number.NaN, y: 0 },
      xAxis: { x: 1, y: 0 },
      yAxis: { x: 0, y: 1 },
      scale: 1,
    };
    expect(() => playerRelativeToImage({ x: 0, y: 0 }, malformedBasis)).toThrow(/finite coordinates/);
    expect(() => imageToFloor({ x: 0, y: 0 }, [1, 0, 0, 0, 1, 0, 0, 0, 1], Number.NaN)).toThrow(
      /positive finite/,
    );
  });

  it("rejects non-finite results caused by finite arithmetic overflow", () => {
    const identityBasis = {
      origin: { x: 0, y: 0 },
      xAxis: { x: 1, y: 0 },
      yAxis: { x: 0, y: 1 },
      scale: 1,
    };
    expect(() =>
      imageToPlayerRelative(
        { x: Number.MAX_VALUE, y: 0 },
        { ...identityBasis, origin: { x: -Number.MAX_VALUE, y: 0 } },
      ),
    ).toThrow(/finite coordinates/);
    expect(() =>
      playerRelativeToImage(
        { x: Number.MAX_VALUE, y: 0 },
        { ...identityBasis, scale: Number.MAX_VALUE },
      ),
    ).toThrow(/finite coordinates/);
    expect(() =>
      imageToFloor(
        { x: 2, y: 0 },
        [Number.MAX_VALUE, 0, 0, 0, 1, 0, 0, 0, 1],
      ),
    ).toThrow(/finite coordinates/);
  });
});

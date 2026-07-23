export const COORDINATE_SPEC_VERSION = "0.1.0" as const;
export const IMAGE_COORDINATE_SYSTEM = "image.normalized.top-left" as const;
export const PROVIDER_WORLD_COORDINATE_SYSTEM = "player.metric.hip-origin.provider-axes" as const;

export interface Point2D {
  x: number;
  y: number;
}

export interface PlayerAnchorSet {
  leftHip: Point2D;
  rightHip: Point2D;
  leftShoulder: Point2D;
  rightShoulder: Point2D;
}

export interface PlayerRelativeBasis {
  origin: Point2D;
  xAxis: Point2D;
  yAxis: Point2D;
  scale: number;
}

export interface FloorPoint {
  xMeters: number;
  zMeters: number;
}

export type Homography3x3 = readonly [number, number, number, number, number, number, number, number, number];

const DEFAULT_EPSILON = 1e-6;

function requirePoint(point: Point2D, name: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error(`${name} must contain finite coordinates`);
}

function midpoint(first: Point2D, second: Point2D): Point2D {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function magnitude(vector: Point2D): number {
  return Math.hypot(vector.x, vector.y);
}

function dot(first: Point2D, second: Point2D): number {
  return first.x * second.x + first.y * second.y;
}

function normalized(vector: Point2D, epsilon: number, name: string): Point2D {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length <= epsilon) throw new Error(`${name} is degenerate`);
  return { x: vector.x / length, y: vector.y / length };
}

export function createPlayerRelativeBasis(anchors: PlayerAnchorSet, epsilon = DEFAULT_EPSILON): PlayerRelativeBasis {
  if (!Number.isFinite(epsilon) || epsilon <= 0) throw new Error("epsilon must be a positive finite number");
  for (const [name, point] of Object.entries(anchors)) requirePoint(point, name);

  const origin = midpoint(anchors.leftHip, anchors.rightHip);
  const shoulderCenter = midpoint(anchors.leftShoulder, anchors.rightShoulder);
  const torso = { x: shoulderCenter.x - origin.x, y: shoulderCenter.y - origin.y };
  const scale = magnitude(torso);
  const yAxis = normalized(torso, epsilon, "shoulder-to-hip axis");
  const hipAxis = { x: anchors.rightHip.x - anchors.leftHip.x, y: anchors.rightHip.y - anchors.leftHip.y };
  const hipProjection = dot(hipAxis, yAxis);
  const orthogonalHipAxis = { x: hipAxis.x - hipProjection * yAxis.x, y: hipAxis.y - hipProjection * yAxis.y };
  const xAxis = normalized(orthogonalHipAxis, epsilon, "left-to-right hip axis");
  if (scale <= epsilon) throw new Error("torso scale is degenerate");
  return { origin, xAxis, yAxis, scale };
}

export function imageToPlayerRelative(point: Point2D, basis: PlayerRelativeBasis): Point2D {
  requirePoint(point, "point");
  requirePoint(basis.origin, "basis origin");
  requirePoint(basis.xAxis, "basis x axis");
  requirePoint(basis.yAxis, "basis y axis");
  if (!Number.isFinite(basis.scale) || basis.scale <= 0) throw new Error("basis scale must be a positive finite number");
  const delta = { x: point.x - basis.origin.x, y: point.y - basis.origin.y };
  return { x: dot(delta, basis.xAxis) / basis.scale, y: dot(delta, basis.yAxis) / basis.scale };
}

export function playerRelativeToImage(point: Point2D, basis: PlayerRelativeBasis): Point2D {
  requirePoint(point, "point");
  requirePoint(basis.origin, "basis origin");
  requirePoint(basis.xAxis, "basis x axis");
  requirePoint(basis.yAxis, "basis y axis");
  if (!Number.isFinite(basis.scale) || basis.scale <= 0) throw new Error("basis scale must be a positive finite number");
  return {
    x: basis.origin.x + basis.scale * (point.x * basis.xAxis.x + point.y * basis.yAxis.x),
    y: basis.origin.y + basis.scale * (point.x * basis.xAxis.y + point.y * basis.yAxis.y),
  };
}

export function imageToFloor(point: Point2D, homography: Homography3x3, epsilon = DEFAULT_EPSILON): FloorPoint {
  requirePoint(point, "point");
  if (!Number.isFinite(epsilon) || epsilon <= 0) throw new Error("epsilon must be a positive finite number");
  if (homography.some((value) => !Number.isFinite(value))) throw new Error("floor homography must contain finite values");
  const denominator = homography[6] * point.x + homography[7] * point.y + homography[8];
  if (Math.abs(denominator) <= epsilon) throw new Error("floor homography projects the point to infinity");
  return {
    xMeters: (homography[0] * point.x + homography[1] * point.y + homography[2]) / denominator,
    zMeters: (homography[3] * point.x + homography[4] * point.y + homography[5]) / denominator,
  };
}

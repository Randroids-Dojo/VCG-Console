import { CORE_LANDMARK_NAMES } from "./landmarks";

export const IDENTITY_TRACKER_ALGORITHMS = [
  "nearest-centroid",
  "kalman-centroid",
  "oks",
  "kalman-oks-hybrid",
  "two-stage-kalman-iou",
] as const;

export type IdentityTrackerAlgorithm =
  (typeof IDENTITY_TRACKER_ALGORITHMS)[number];

export interface IdentityLandmarkObservation {
  x: number;
  y: number;
  observed: boolean;
}

export interface IdentityPoseDetection {
  confidence: number;
  landmarks: ReadonlyArray<IdentityLandmarkObservation>;
}

export interface IdentityTrackerFrame {
  timestampMs: number;
  detections: ReadonlyArray<IdentityPoseDetection>;
}

export interface IdentityAssignment {
  detectionIndex: number;
  trackId: string;
}

export interface IdentityTrackerUpdate {
  timestampMs: number;
  assignments: IdentityAssignment[];
  activeTrackIds: string[];
  unmatchedDetectionIndices: number[];
}

export interface IdentityTrackerOptions {
  algorithm: IdentityTrackerAlgorithm;
  maxTracks?: number;
  maxMissedFrames?: number;
  maxAssociationDistance?: number;
  minimumDetectionConfidence?: number;
  highConfidenceThreshold?: number;
  minimumOks?: number;
}

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface NormalizedDetection {
  sourceIndex: number;
  confidence: number;
  landmarks: IdentityLandmarkObservation[];
  centroid: Point;
  bounds: Bounds;
}

interface AxisFilter {
  position: number;
  velocity: number;
  p00: number;
  p01: number;
  p10: number;
  p11: number;
}

interface TrackState {
  numericId: number;
  trackId: string;
  missedFrames: number;
  lastTimestampMs: number;
  lastDetection: NormalizedDetection;
  filterX: AxisFilter;
  filterY: AxisFilter;
}

interface PredictedTrack {
  track: TrackState;
  centroid: Point;
  bounds: Bounds;
  filterX: AxisFilter;
  filterY: AxisFilter;
}

interface Match {
  trackIndex: number;
  detectionIndex: number;
}

const TORSO_INDICES = [5, 6, 11, 12] as const;
const COCO_OKS_SIGMAS = [
  0.026,
  0.025,
  0.025,
  0.035,
  0.035,
  0.079,
  0.079,
  0.072,
  0.072,
  0.062,
  0.062,
  0.107,
  0.107,
  0.087,
  0.087,
  0.089,
  0.089,
] as const;

const DEFAULT_MAX_TRACKS = 4;
const DEFAULT_MAX_MISSED_FRAMES = 6;
const DEFAULT_MAX_ASSOCIATION_DISTANCE = 0.25;
const DEFAULT_MINIMUM_DETECTION_CONFIDENCE = 0.1;
const DEFAULT_HIGH_CONFIDENCE_THRESHOLD = 0.6;
const DEFAULT_MINIMUM_OKS = 0.2;
const MAX_INPUT_DETECTIONS = 16;
const MINIMUM_BOUNDS_AREA = 1e-4;
const PROCESS_ACCELERATION_VARIANCE = 0.04;
const BASE_MEASUREMENT_VARIANCE = 0.0025;

interface RequiredIdentityTrackerOptions {
  algorithm: IdentityTrackerAlgorithm;
  maxTracks: number;
  maxMissedFrames: number;
  maxAssociationDistance: number;
  minimumDetectionConfidence: number;
  highConfidenceThreshold: number;
  minimumOks: number;
}

export class AppearanceFreeIdentityTracker {
  readonly #options: RequiredIdentityTrackerOptions;
  readonly #tracks: TrackState[] = [];
  #nextTrackId = 1;
  #lastTimestampMs: number | undefined;

  constructor(options: IdentityTrackerOptions) {
    this.#options = validateOptions(options);
  }

  update(frame: IdentityTrackerFrame): IdentityTrackerUpdate {
    const detections = validateFrame(frame, this.#lastTimestampMs);
    this.#lastTimestampMs = frame.timestampMs;
    const predictions = this.#tracks.map((track) =>
      predictTrack(track, frame.timestampMs),
    );
    const eligibleIndices = detections
      .filter(
        (detection) =>
          detection.confidence >=
          this.#options.minimumDetectionConfidence,
      )
      .map(({ sourceIndex }) => sourceIndex);

    const matches =
      this.#options.algorithm === "two-stage-kalman-iou"
        ? this.#twoStageMatches(predictions, detections, eligibleIndices)
        : associate(
            predictions,
            detections,
            eligibleIndices,
            (prediction, detection) =>
              associationCost(
                this.#options.algorithm,
                prediction,
                detection,
                this.#options,
              ),
          );

    const matchedTracks = new Set(matches.map(({ trackIndex }) => trackIndex));
    const matchedDetections = new Set(
      matches.map(({ detectionIndex }) => detectionIndex),
    );
    const assignments: IdentityAssignment[] = [];

    for (const { trackIndex, detectionIndex } of matches) {
      const track = this.#tracks[trackIndex];
      const prediction = predictions[trackIndex];
      const detection = detections[detectionIndex];
      if (!track || !prediction || !detection) {
        throw new Error("identity association produced an invalid match");
      }
      updateMatchedTrack(track, prediction, detection, frame.timestampMs);
      assignments.push({
        detectionIndex: detection.sourceIndex,
        trackId: track.trackId,
      });
    }

    for (const [trackIndex, track] of this.#tracks.entries()) {
      if (matchedTracks.has(trackIndex)) continue;
      const prediction = predictions[trackIndex];
      if (!prediction) throw new Error("identity prediction is missing");
      advanceUnmatchedTrack(track, prediction, frame.timestampMs);
    }

    for (let index = this.#tracks.length - 1; index >= 0; index -= 1) {
      if (
        (this.#tracks[index]?.missedFrames ?? 0) >
        this.#options.maxMissedFrames
      ) {
        this.#tracks.splice(index, 1);
      }
    }

    const createThreshold =
      this.#options.algorithm === "two-stage-kalman-iou"
        ? this.#options.highConfidenceThreshold
        : this.#options.minimumDetectionConfidence;
    for (const detectionIndex of eligibleIndices) {
      if (
        matchedDetections.has(detectionIndex) ||
        this.#tracks.length >= this.#options.maxTracks
      ) {
        continue;
      }
      const detection = detections[detectionIndex];
      if (!detection || detection.confidence < createThreshold) continue;
      const track = createTrack(
        this.#nextTrackId,
        detection,
        frame.timestampMs,
      );
      this.#nextTrackId += 1;
      this.#tracks.push(track);
      assignments.push({
        detectionIndex: detection.sourceIndex,
        trackId: track.trackId,
      });
    }

    assignments.sort(
      (left, right) =>
        left.detectionIndex - right.detectionIndex ||
        left.trackId.localeCompare(right.trackId),
    );
    const assignedDetectionIndices = new Set(
      assignments.map(({ detectionIndex }) => detectionIndex),
    );
    return {
      timestampMs: frame.timestampMs,
      assignments,
      activeTrackIds: this.#tracks
        .map(({ numericId, trackId }) => ({ numericId, trackId }))
        .sort((left, right) => left.numericId - right.numericId)
        .map(({ trackId }) => trackId),
      unmatchedDetectionIndices: detections
        .map(({ sourceIndex }) => sourceIndex)
        .filter((index) => !assignedDetectionIndices.has(index)),
    };
  }

  #twoStageMatches(
    predictions: readonly PredictedTrack[],
    detections: readonly NormalizedDetection[],
    eligibleIndices: readonly number[],
  ): Match[] {
    const high = eligibleIndices.filter(
      (index) =>
        (detections[index]?.confidence ?? 0) >=
        this.#options.highConfidenceThreshold,
    );
    const low = eligibleIndices.filter(
      (index) =>
        (detections[index]?.confidence ?? 0) <
        this.#options.highConfidenceThreshold,
    );
    const cost = (
      prediction: PredictedTrack,
      detection: NormalizedDetection,
    ) =>
      associationCost(
        "two-stage-kalman-iou",
        prediction,
        detection,
        this.#options,
      );
    const first = associate(predictions, detections, high, cost);
    const matchedTracks = new Set(first.map(({ trackIndex }) => trackIndex));
    const remainingPredictions = predictions.filter(
      (_, index) => !matchedTracks.has(index),
    );
    const remainingOriginalIndices = predictions
      .map((_, index) => index)
      .filter((index) => !matchedTracks.has(index));
    const secondRelative = associate(
      remainingPredictions,
      detections,
      low,
      cost,
    );
    const second = secondRelative.map(({ trackIndex, detectionIndex }) => {
      const originalTrackIndex = remainingOriginalIndices[trackIndex];
      if (originalTrackIndex === undefined) {
        throw new Error("two-stage identity association lost a track index");
      }
      return { trackIndex: originalTrackIndex, detectionIndex };
    });
    return [...first, ...second];
  }
}

function validateOptions(
  options: IdentityTrackerOptions,
): RequiredIdentityTrackerOptions {
  if (!IDENTITY_TRACKER_ALGORITHMS.includes(options.algorithm)) {
    throw new Error("algorithm is unsupported");
  }
  const maxTracks = boundedInteger(
    options.maxTracks ?? DEFAULT_MAX_TRACKS,
    1,
    4,
    "maxTracks",
  );
  const maxMissedFrames = boundedInteger(
    options.maxMissedFrames ?? DEFAULT_MAX_MISSED_FRAMES,
    0,
    120,
    "maxMissedFrames",
  );
  const maxAssociationDistance = boundedNumber(
    options.maxAssociationDistance ??
      DEFAULT_MAX_ASSOCIATION_DISTANCE,
    Number.EPSILON,
    2,
    "maxAssociationDistance",
  );
  const minimumDetectionConfidence = boundedNumber(
    options.minimumDetectionConfidence ??
      DEFAULT_MINIMUM_DETECTION_CONFIDENCE,
    0,
    1,
    "minimumDetectionConfidence",
  );
  const highConfidenceThreshold = boundedNumber(
    options.highConfidenceThreshold ??
      DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
    minimumDetectionConfidence,
    1,
    "highConfidenceThreshold",
  );
  const minimumOks = boundedNumber(
    options.minimumOks ?? DEFAULT_MINIMUM_OKS,
    Number.EPSILON,
    1,
    "minimumOks",
  );
  return {
    algorithm: options.algorithm,
    maxTracks,
    maxMissedFrames,
    maxAssociationDistance,
    minimumDetectionConfidence,
    highConfidenceThreshold,
    minimumOks,
  };
}

function validateFrame(
  frame: IdentityTrackerFrame,
  previousTimestampMs: number | undefined,
): NormalizedDetection[] {
  if (!Number.isFinite(frame.timestampMs) || frame.timestampMs < 0) {
    throw new Error("timestampMs must be a non-negative finite number");
  }
  if (
    previousTimestampMs !== undefined &&
    frame.timestampMs <= previousTimestampMs
  ) {
    throw new Error("identity frames must have strictly increasing timestamps");
  }
  if (
    !Array.isArray(frame.detections) ||
    frame.detections.length > MAX_INPUT_DETECTIONS
  ) {
    throw new Error(
      `detections must contain at most ${MAX_INPUT_DETECTIONS} entries`,
    );
  }
  return frame.detections.map((detection, sourceIndex) =>
    validateDetection(detection, sourceIndex),
  );
}

function validateDetection(
  detection: IdentityPoseDetection,
  sourceIndex: number,
): NormalizedDetection {
  boundedNumber(
    detection.confidence,
    0,
    1,
    `detections[${sourceIndex}].confidence`,
  );
  if (
    !Array.isArray(detection.landmarks) ||
    detection.landmarks.length !== CORE_LANDMARK_NAMES.length
  ) {
    throw new Error(
      `detections[${sourceIndex}].landmarks must contain exactly ${CORE_LANDMARK_NAMES.length} entries`,
    );
  }
  const landmarks = detection.landmarks.map((landmark, landmarkIndex) => {
    if (typeof landmark.observed !== "boolean") {
      throw new Error(
        `detections[${sourceIndex}].landmarks[${landmarkIndex}].observed must be boolean`,
      );
    }
    if (!Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) {
      throw new Error(
        `detections[${sourceIndex}].landmarks[${landmarkIndex}] must contain finite coordinates`,
      );
    }
    return { x: landmark.x, y: landmark.y, observed: landmark.observed };
  });
  const observed = landmarks.filter(({ observed: present }) => present);
  if (observed.length === 0) {
    throw new Error(
      `detections[${sourceIndex}] must contain at least one observed landmark`,
    );
  }
  return {
    sourceIndex,
    confidence: detection.confidence,
    landmarks,
    centroid: poseCentroid(landmarks),
    bounds: poseBounds(observed),
  };
}

function poseCentroid(
  landmarks: readonly IdentityLandmarkObservation[],
): Point {
  const torso = TORSO_INDICES.flatMap((index) => {
    const landmark = landmarks[index];
    return landmark?.observed ? [landmark] : [];
  });
  const points = torso.length > 0 ? torso : landmarks.filter(({ observed }) => observed);
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function poseBounds(
  landmarks: readonly IdentityLandmarkObservation[],
): Bounds {
  return landmarks.reduce(
    (bounds, landmark) => ({
      left: Math.min(bounds.left, landmark.x),
      top: Math.min(bounds.top, landmark.y),
      right: Math.max(bounds.right, landmark.x),
      bottom: Math.max(bounds.bottom, landmark.y),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
}

function createTrack(
  numericId: number,
  detection: NormalizedDetection,
  timestampMs: number,
): TrackState {
  return {
    numericId,
    trackId: `pose-${numericId}`,
    missedFrames: 0,
    lastTimestampMs: timestampMs,
    lastDetection: detection,
    filterX: createAxisFilter(detection.centroid.x),
    filterY: createAxisFilter(detection.centroid.y),
  };
}

function createAxisFilter(position: number): AxisFilter {
  return {
    position,
    velocity: 0,
    p00: 0.01,
    p01: 0,
    p10: 0,
    p11: 1,
  };
}

function predictTrack(track: TrackState, timestampMs: number): PredictedTrack {
  const elapsedSeconds = Math.max(
    0,
    (timestampMs - track.lastTimestampMs) / 1000,
  );
  const filterX = predictAxis(track.filterX, elapsedSeconds);
  const filterY = predictAxis(track.filterY, elapsedSeconds);
  const centroid = { x: filterX.position, y: filterY.position };
  const delta = {
    x: centroid.x - track.lastDetection.centroid.x,
    y: centroid.y - track.lastDetection.centroid.y,
  };
  return {
    track,
    centroid,
    bounds: translateBounds(track.lastDetection.bounds, delta),
    filterX,
    filterY,
  };
}

function predictAxis(filter: AxisFilter, elapsedSeconds: number): AxisFilter {
  const dt = Math.min(elapsedSeconds, 2);
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt2 * dt2;
  return {
    position: filter.position + filter.velocity * dt,
    velocity: filter.velocity,
    p00:
      filter.p00 +
      dt * (filter.p10 + filter.p01) +
      dt2 * filter.p11 +
      (PROCESS_ACCELERATION_VARIANCE * dt4) / 4,
    p01:
      filter.p01 +
      dt * filter.p11 +
      (PROCESS_ACCELERATION_VARIANCE * dt3) / 2,
    p10:
      filter.p10 +
      dt * filter.p11 +
      (PROCESS_ACCELERATION_VARIANCE * dt3) / 2,
    p11: filter.p11 + PROCESS_ACCELERATION_VARIANCE * dt2,
  };
}

function updateMatchedTrack(
  track: TrackState,
  prediction: PredictedTrack,
  detection: NormalizedDetection,
  timestampMs: number,
): void {
  const measurementVariance =
    BASE_MEASUREMENT_VARIANCE / Math.max(detection.confidence, 0.1);
  track.filterX = updateAxis(
    prediction.filterX,
    detection.centroid.x,
    measurementVariance,
  );
  track.filterY = updateAxis(
    prediction.filterY,
    detection.centroid.y,
    measurementVariance,
  );
  track.lastDetection = detection;
  track.lastTimestampMs = timestampMs;
  track.missedFrames = 0;
}

function updateAxis(
  prediction: AxisFilter,
  measurement: number,
  measurementVariance: number,
): AxisFilter {
  const innovationVariance = prediction.p00 + measurementVariance;
  const gainPosition = prediction.p00 / innovationVariance;
  const gainVelocity = prediction.p10 / innovationVariance;
  const innovation = measurement - prediction.position;
  return {
    position: prediction.position + gainPosition * innovation,
    velocity: prediction.velocity + gainVelocity * innovation,
    p00: (1 - gainPosition) * prediction.p00,
    p01: (1 - gainPosition) * prediction.p01,
    p10: prediction.p10 - gainVelocity * prediction.p00,
    p11: prediction.p11 - gainVelocity * prediction.p01,
  };
}

function advanceUnmatchedTrack(
  track: TrackState,
  prediction: PredictedTrack,
  timestampMs: number,
): void {
  track.filterX = prediction.filterX;
  track.filterY = prediction.filterY;
  track.lastTimestampMs = timestampMs;
  track.missedFrames += 1;
}

function associationCost(
  algorithm: IdentityTrackerAlgorithm,
  prediction: PredictedTrack,
  detection: NormalizedDetection,
  options: RequiredIdentityTrackerOptions,
): number {
  const lastCentroid = prediction.track.lastDetection.centroid;
  const predictedDistance = pointDistance(
    prediction.centroid,
    detection.centroid,
  );
  const nearestDistance = pointDistance(lastCentroid, detection.centroid);
  const similarity = oks(
    prediction.track.lastDetection,
    detection,
  );
  switch (algorithm) {
    case "nearest-centroid":
      return nearestDistance <= options.maxAssociationDistance
        ? nearestDistance / options.maxAssociationDistance
        : Number.POSITIVE_INFINITY;
    case "kalman-centroid":
      return predictedDistance <= options.maxAssociationDistance
        ? predictedDistance / options.maxAssociationDistance
        : Number.POSITIVE_INFINITY;
    case "oks":
      return similarity >= options.minimumOks
        ? 1 - similarity
        : Number.POSITIVE_INFINITY;
    case "kalman-oks-hybrid":
      if (
        predictedDistance > options.maxAssociationDistance ||
        similarity < options.minimumOks
      ) {
        return Number.POSITIVE_INFINITY;
      }
      return (
        0.55 * (predictedDistance / options.maxAssociationDistance) +
        0.45 * (1 - similarity)
      );
    case "two-stage-kalman-iou": {
      if (predictedDistance > options.maxAssociationDistance) {
        return Number.POSITIVE_INFINITY;
      }
      const overlap = intersectionOverUnion(
        prediction.bounds,
        detection.bounds,
      );
      return (
        0.7 * (predictedDistance / options.maxAssociationDistance) +
        0.3 * (1 - overlap)
      );
    }
  }
}

function oks(
  previous: NormalizedDetection,
  current: NormalizedDetection,
): number {
  const previousArea = boundsArea(previous.bounds);
  const currentArea = boundsArea(current.bounds);
  const scaleSquared = Math.max(
    (previousArea + currentArea) / 2,
    MINIMUM_BOUNDS_AREA,
  );
  let total = 0;
  let count = 0;
  for (let index = 0; index < CORE_LANDMARK_NAMES.length; index += 1) {
    const left = previous.landmarks[index];
    const right = current.landmarks[index];
    const sigma = COCO_OKS_SIGMAS[index];
    if (!left?.observed || !right?.observed || sigma === undefined) continue;
    const squaredDistance =
      (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
    total += Math.exp(
      -squaredDistance / (2 * scaleSquared * sigma ** 2),
    );
    count += 1;
  }
  return count === 0 ? 0 : total / count;
}

function associate(
  predictions: readonly PredictedTrack[],
  detections: readonly NormalizedDetection[],
  eligibleDetectionIndices: readonly number[],
  cost: (
    prediction: PredictedTrack,
    detection: NormalizedDetection,
  ) => number,
): Match[] {
  let best: { matches: Match[]; cost: number } = {
    matches: [],
    cost: Number.POSITIVE_INFINITY,
  };
  const used = new Set<number>();
  const current: Match[] = [];

  const search = (trackIndex: number, currentCost: number): void => {
    if (trackIndex === predictions.length) {
      if (
        current.length > best.matches.length ||
        (current.length === best.matches.length &&
          (currentCost < best.cost ||
            (currentCost === best.cost &&
              matchKey(current) < matchKey(best.matches))))
      ) {
        best = { matches: [...current], cost: currentCost };
      }
      return;
    }
    search(trackIndex + 1, currentCost);
    const prediction = predictions[trackIndex];
    if (!prediction) return;
    for (const detectionIndex of eligibleDetectionIndices) {
      if (used.has(detectionIndex)) continue;
      const detection = detections[detectionIndex];
      if (!detection) continue;
      const candidateCost = cost(prediction, detection);
      if (!Number.isFinite(candidateCost)) continue;
      used.add(detectionIndex);
      current.push({ trackIndex, detectionIndex });
      search(trackIndex + 1, currentCost + candidateCost);
      current.pop();
      used.delete(detectionIndex);
    }
  };
  search(0, 0);
  return best.matches.sort(
    (left, right) =>
      left.trackIndex - right.trackIndex ||
      left.detectionIndex - right.detectionIndex,
  );
}

function matchKey(matches: readonly Match[]): string {
  return matches
    .map(({ trackIndex, detectionIndex }) => `${trackIndex}:${detectionIndex}`)
    .join("|");
}

function translateBounds(bounds: Bounds, delta: Point): Bounds {
  return {
    left: bounds.left + delta.x,
    top: bounds.top + delta.y,
    right: bounds.right + delta.x,
    bottom: bounds.bottom + delta.y,
  };
}

function intersectionOverUnion(left: Bounds, right: Bounds): number {
  const intersectionWidth = Math.max(
    0,
    Math.min(left.right, right.right) - Math.max(left.left, right.left),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
  );
  const intersection = intersectionWidth * intersectionHeight;
  const union = boundsArea(left) + boundsArea(right) - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function boundsArea(bounds: Bounds): number {
  return (
    Math.max(0, bounds.right - bounds.left) *
    Math.max(0, bounds.bottom - bounds.top)
  );
}

function pointDistance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function boundedNumber(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

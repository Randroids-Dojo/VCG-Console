export function nextMediaPipeTimestampMs(nowMs: number, previousMs: number | undefined): number {
  const currentMs = Math.floor(nowMs);
  return previousMs === undefined ? currentMs : Math.max(currentMs, previousMs + 1);
}

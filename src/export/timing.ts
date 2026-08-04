// Frame i of an export renders the timeline instant min(i * 1000/fps, totalMs).
// The count includes a final frame at exactly totalMs so the video ends on the
// last keyframe's settled state.
export function frameCount(totalMs: number, fps: number): number {
  return Math.max(1, Math.round((totalMs * fps) / 1000) + 1);
}

export function frameTimeMs(i: number, fps: number, totalMs: number): number {
  return Math.min((i * 1000) / fps, totalMs);
}

export function frameTimestampUs(i: number, fps: number): number {
  return Math.round((i * 1_000_000) / fps);
}

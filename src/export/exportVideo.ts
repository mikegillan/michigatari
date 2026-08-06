import * as Mp4Muxer from 'mp4-muxer';
import * as WebmMuxer from 'webm-muxer';
import { appConfig, styleOptionFor } from '../config';
import type { Project } from '../engine/types';
import { buildEncoderConfig, exportDimensions, type ExportFormat } from './encoderConfig';
import { frameTimestampUs } from './timing';
import { createExportMap, renderFrames } from './renderFrames';

export type ExportTarget =
  | { kind: 'stream'; stream: FileSystemWritableFileStream }
  | { kind: 'buffer' };

export interface ExportResult {
  blob: Blob | null;
  completed: boolean;
}

interface VideoMuxer {
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  finalize(): void;
}

function createMuxer(
  format: ExportFormat,
  project: Project,
  target: ExportTarget,
): { muxer: VideoMuxer; takeBuffer: () => ArrayBuffer | null } {
  const { width, height } = exportDimensions(project.settings);
  if (format === 'mp4') {
    const muxTarget =
      target.kind === 'stream'
        ? new Mp4Muxer.FileSystemWritableFileStreamTarget(target.stream)
        : new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({
      target: muxTarget,
      video: { codec: 'avc', width, height, frameRate: project.settings.fps },
      fastStart: false,
      firstTimestampBehavior: 'offset',
    });
    return {
      muxer,
      takeBuffer: () => (muxTarget instanceof Mp4Muxer.ArrayBufferTarget ? muxTarget.buffer : null),
    };
  }
  const muxTarget =
    target.kind === 'stream'
      ? new WebmMuxer.FileSystemWritableFileStreamTarget(target.stream)
      : new WebmMuxer.ArrayBufferTarget();
  const muxer = new WebmMuxer.Muxer({
    target: muxTarget,
    video: { codec: 'V_VP9', width, height, frameRate: project.settings.fps },
    firstTimestampBehavior: 'offset',
  });
  return {
    muxer,
    takeBuffer: () => (muxTarget instanceof WebmMuxer.ArrayBufferTarget ? muxTarget.buffer : null),
  };
}

// North indicator, bottom-left, rotated so it points at map-north — matches
// the editor's CompassOverlay SVG (plate 8% of height, red north / grey south).
function drawCompass(ctx: CanvasRenderingContext2D, height: number, bearing: number): void {
  const r = Math.max(14, Math.round(height * 0.04));
  const margin = Math.round(height * 0.025);
  ctx.save();
  ctx.translate(margin + r, height - margin - r);
  ctx.rotate((-bearing * Math.PI) / 180);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  const u = r / 20;
  ctx.fillStyle = '#d63031';
  ctx.beginPath();
  ctx.moveTo(0, -16 * u);
  ctx.lineTo(-5 * u, 0);
  ctx.lineTo(5 * u, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8a8f98';
  ctx.beginPath();
  ctx.moveTo(-5 * u, 0);
  ctx.lineTo(5 * u, 0);
  ctx.lineTo(0, 16 * u);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export async function exportVideo(
  project: Project,
  options: {
    format: ExportFormat;
    target: ExportTarget;
    /** Burn the credit line into frames (default true). Callers passing false
     * are responsible for attribution elsewhere (e.g. video description). */
    attribution?: boolean;
    onProgress?(frameIndex: number, total: number): void;
    shouldCancel?(): boolean;
  },
): Promise<ExportResult> {
  const { format, target, attribution = true, onProgress, shouldCancel } = options;
  const fps = project.settings.fps;

  let encoderError: Error | null = null;
  let encoder: VideoEncoder | null = null;
  let exportMap: ReturnType<typeof createExportMap> | null = null;
  let cancelled = false;
  try {
    const { muxer, takeBuffer } = createMuxer(format, project, target);
    encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (err) => {
        encoderError = err instanceof Error ? err : new Error(String(err));
      },
    });
    encoder.configure(buildEncoderConfig(format, project.settings));
    const enc = encoder;

    // The DOM attribution control can't reach the exported canvas pixels, so
    // burn OSM attribution into every frame via a composite 2D canvas.
    const { width, height } = exportDimensions(project.settings);
    const composite = document.createElement('canvas');
    composite.width = width;
    composite.height = height;
    const ctx = composite.getContext('2d')!;
    const fontPx = Math.max(11, Math.round(height * 0.015));

    // Branding watermark (top-left). A missing asset must not fail the export.
    let watermark: ImageBitmap | null = null;
    if (appConfig.exportWatermark) {
      try {
        const res = await fetch(appConfig.exportWatermark);
        watermark = await createImageBitmap(await res.blob());
      } catch { /* export continues unbranded */ }
    }

    exportMap = createExportMap(project);
    await renderFrames(exportMap.map, project, {
      shouldCancel: () => {
        cancelled = shouldCancel?.() ?? false;
        return cancelled;
      },
      onFrame: async (canvas, i, total, info) => {
        if (encoderError) throw encoderError;
        if (enc.encodeQueueSize > 4) {
          await new Promise<void>((resolve) => {
            let iv = 0;
            const onDequeue = () => {
              cleanup();
              resolve();
            };
            const cleanup = () => {
              enc.removeEventListener('dequeue', onDequeue);
              clearInterval(iv);
            };
            enc.addEventListener('dequeue', onDequeue);
            iv = window.setInterval(() => {
              if (encoderError) {
                cleanup();
                resolve();
              }
            }, 250);
          });
          if (encoderError) throw encoderError;
        }

        ctx.drawImage(canvas, 0, 0); // always: the composite canvas is the frame source
        if (info.styleFade) {
          // cross-fade out of the previous basemap style
          ctx.globalAlpha = info.styleFade.alpha;
          ctx.drawImage(info.styleFade.image, 0, 0);
          ctx.globalAlpha = 1;
        }
        if (attribution) {
          // per-frame: keyframe style overrides change which provider to credit
          const label = styleOptionFor(info.styleUrl)?.attribution ?? appConfig.exportAttribution;
          ctx.font = `${fontPx}px sans-serif`;
          const pad = Math.round(fontPx * 0.5);
          const w = ctx.measureText(label).width + pad * 2;
          const h = fontPx + pad * 2;
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillRect(width - w, height - h, w, h);
          ctx.fillStyle = '#333';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, width - w + pad, height - h / 2);
        }
        if (info.showCompass) drawCompass(ctx, height, info.bearing);
        if (watermark) {
          const h = Math.max(24, Math.round(height * 0.05));
          const w = Math.round((watermark.width / watermark.height) * h);
          const margin = Math.round(height * 0.02);
          ctx.globalAlpha = 0.9;
          ctx.drawImage(watermark, margin, margin, w, h);
          ctx.globalAlpha = 1;
        }

        const frame = new VideoFrame(composite, {
          timestamp: frameTimestampUs(i, fps),
          duration: Math.round(1_000_000 / fps),
        });
        try {
          enc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        } finally {
          frame.close();
        }
        onProgress?.(i, total);
      },
    });

    watermark?.close();
    if (cancelled) {
      if (enc.state !== 'closed') enc.close();
      if (target.kind === 'stream') await target.stream.abort();
      return { blob: null, completed: false };
    }

    await enc.flush();
    if (encoderError) throw encoderError;
    enc.close();
    muxer.finalize();

    if (target.kind === 'stream') {
      await target.stream.close();
      return { blob: null, completed: true };
    }
    const buffer = takeBuffer();
    return { blob: buffer ? new Blob([buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' }) : null, completed: true };
  } catch (err) {
    try {
      if (encoder && encoder.state !== 'closed') encoder.close();
    } catch {
      /* already errored */
    }
    if (target.kind === 'stream') {
      try {
        await target.stream.abort();
      } catch {
        /* stream already closed */
      }
    }
    throw err;
  } finally {
    exportMap?.dispose();
  }
}

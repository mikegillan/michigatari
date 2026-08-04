import * as Mp4Muxer from 'mp4-muxer';
import * as WebmMuxer from 'webm-muxer';
import type { Project } from '../engine/types';
import { buildEncoderConfig, exportDimensions, type ExportFormat } from './encoderConfig';
import { frameTimestampUs } from './timing';
import { createExportMap, renderFrames } from './renderFrames';

export type ExportTarget =
  | { kind: 'stream'; stream: FileSystemWritableFileStream }
  | { kind: 'buffer' };

export interface ExportResult {
  blob: Blob | null;
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
      video: { codec: 'avc', width, height },
      fastStart: target.kind === 'buffer' ? 'in-memory' : false,
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

export async function exportVideo(
  project: Project,
  options: {
    format: ExportFormat;
    target: ExportTarget;
    onProgress?(frameIndex: number, total: number): void;
    shouldCancel?(): boolean;
  },
): Promise<ExportResult> {
  const { format, target, onProgress, shouldCancel } = options;
  const fps = project.settings.fps;
  const { muxer, takeBuffer } = createMuxer(format, project, target);

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });
  encoder.configure(buildEncoderConfig(format, project.settings));

  const exportMap = createExportMap(project);
  let cancelled = false;
  try {
    await renderFrames(exportMap.map, project, {
      shouldCancel: () => {
        cancelled = shouldCancel?.() ?? false;
        return cancelled;
      },
      onFrame: async (canvas, i, total) => {
        if (encoderError) throw encoderError;
        if (encoder.encodeQueueSize > 4) {
          await new Promise<void>((resolve) =>
            encoder.addEventListener('dequeue', () => resolve(), { once: true }),
          );
        }
        const frame = new VideoFrame(canvas, { timestamp: frameTimestampUs(i, fps) });
        try {
          encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        } finally {
          frame.close();
        }
        onProgress?.(i, total);
      },
    });

    if (cancelled) {
      encoder.close();
      if (target.kind === 'stream') await target.stream.abort?.();
      return { blob: null };
    }

    await encoder.flush();
    if (encoderError) throw encoderError;
    encoder.close();
    muxer.finalize();

    if (target.kind === 'stream') {
      await target.stream.close();
      return { blob: null };
    }
    const buffer = takeBuffer();
    return { blob: buffer ? new Blob([buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' }) : null };
  } catch (err) {
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      /* already errored */
    }
    if (target.kind === 'stream') {
      try {
        await target.stream.abort?.();
      } catch {
        /* stream already closed */
      }
    }
    throw err;
  } finally {
    exportMap.dispose();
  }
}

import type { Settings } from '../engine/types';
import { REFERENCE_VIEWPORT } from '../engine/viewport';

export type ExportFormat = 'mp4' | 'webm';

const SHORT_SIDE: Record<Settings['resolution'], number> = {
  '1080p': 1080,
  '1440p': 1440,
  '4k': 2160,
};

export function exportDimensions(settings: Settings): { width: number; height: number } {
  const short = SHORT_SIDE[settings.resolution];
  const long = Math.round((short * 16) / 9);
  return settings.aspect === '16:9' ? { width: long, height: short } : { width: short, height: long };
}

export function exportPixelRatio(settings: Settings): number {
  return exportDimensions(settings).width / REFERENCE_VIEWPORT[settings.aspect].width;
}

export function buildEncoderConfig(format: ExportFormat, settings: Settings): VideoEncoderConfig {
  const { width, height } = exportDimensions(settings);
  const fps = settings.fps;
  const bitrate = Math.round(width * height * fps * 0.1);
  if (format === 'mp4') {
    // High profile; level 5.2 is required for 3840×2160@60, 5.1 covers the rest
    const codec = settings.resolution === '4k' && fps === 60 ? 'avc1.640034' : 'avc1.640033';
    return { codec, width, height, bitrate, framerate: fps, avc: { format: 'avc' } };
  }
  return { codec: 'vp09.00.51.08', width, height, bitrate, framerate: fps };
}

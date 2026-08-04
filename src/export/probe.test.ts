import { expect, it, vi } from 'vitest';
import { probeExportFormats } from './probe';
import type { Settings } from '../engine/types';

const settings: Settings = { resolution: '1080p', aspect: '16:9', fps: 30, styleUrl: '' };

it('reports each format from the injected support check', async () => {
  const isSupported = vi.fn(async (config: VideoEncoderConfig) => ({
    supported: config.codec.startsWith('avc'),
  }));
  await expect(probeExportFormats(settings, isSupported)).resolves.toEqual({ mp4: true, webm: false });
  expect(isSupported).toHaveBeenCalledTimes(2);
});

it('treats a rejected or empty support check as unsupported', async () => {
  const isSupported = vi.fn(async (config: VideoEncoderConfig) =>
    config.codec.startsWith('vp09') ? Promise.reject(new Error('boom')) : {},
  ) as unknown as (c: VideoEncoderConfig) => Promise<{ supported?: boolean }>;
  await expect(probeExportFormats(settings, isSupported)).resolves.toEqual({ mp4: false, webm: false });
});

it('resolves all-false when WebCodecs is absent and no check is injected', async () => {
  // node test environment has no VideoEncoder global
  await expect(probeExportFormats(settings)).resolves.toEqual({ mp4: false, webm: false });
});

import { expect, it } from 'vitest';
import { buildEncoderConfig, exportDimensions, exportPixelRatio } from './encoderConfig';
import type { Settings } from '../engine/types';

function s(resolution: Settings['resolution'], aspect: Settings['aspect'], fps: Settings['fps']): Settings {
  return { resolution, aspect, fps, styleUrl: '' };
}

it('maps settings to export pixel dimensions', () => {
  expect(exportDimensions(s('1080p', '16:9', 30))).toEqual({ width: 1920, height: 1080 });
  expect(exportDimensions(s('4k', '16:9', 60))).toEqual({ width: 3840, height: 2160 });
  expect(exportDimensions(s('4k', '9:16', 30))).toEqual({ width: 2160, height: 3840 });
});

it('derives pixelRatio from export width over reference width', () => {
  expect(exportPixelRatio(s('1080p', '16:9', 30))).toBe(1);
  expect(exportPixelRatio(s('4k', '16:9', 30))).toBe(2);
  expect(exportPixelRatio(s('4k', '9:16', 30))).toBe(2); // 2160/1080
});

it('picks H.264 level 5.2 only for 4k60', () => {
  expect(buildEncoderConfig('mp4', s('4k', '16:9', 60)).codec).toBe('avc1.640034');
  expect(buildEncoderConfig('mp4', s('4k', '16:9', 30)).codec).toBe('avc1.640033');
  expect(buildEncoderConfig('mp4', s('1080p', '16:9', 60)).codec).toBe('avc1.640033');
});

it('builds complete configs with bitrate and framerate', () => {
  const cfg = buildEncoderConfig('webm', s('1080p', '16:9', 30));
  expect(cfg.codec).toBe('vp09.00.51.08');
  expect(cfg.width).toBe(1920);
  expect(cfg.height).toBe(1080);
  expect(cfg.framerate).toBe(30);
  expect(cfg.bitrate).toBe(Math.round(1920 * 1080 * 30 * 0.1));
  expect(buildEncoderConfig('mp4', s('1080p', '16:9', 30)).avc).toEqual({ format: 'avc' });
});

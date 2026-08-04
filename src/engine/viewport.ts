import type { Settings } from './types';

const SHORT_SIDE: Record<Settings['resolution'], number> = {
  '1080p': 1080,
  '1440p': 1440,
  '4k': 2160,
};

export function viewportForSettings(settings: Settings): { width: number; height: number } {
  const short = SHORT_SIDE[settings.resolution];
  const long = Math.round((short * 16) / 9);
  return settings.aspect === '16:9' ? { width: long, height: short } : { width: short, height: long };
}

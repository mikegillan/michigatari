import type { Settings } from '../engine/types';
import { buildEncoderConfig } from './encoderConfig';

type SupportCheck = (config: VideoEncoderConfig) => Promise<{ supported?: boolean }>;

function defaultCheck(): SupportCheck | null {
  if (typeof VideoEncoder === 'undefined') return null;
  return (config) => VideoEncoder.isConfigSupported(config);
}

export async function probeExportFormats(
  settings: Settings,
  isSupported: SupportCheck | null = defaultCheck(),
): Promise<{ mp4: boolean; webm: boolean }> {
  if (!isSupported) return { mp4: false, webm: false };
  const check = async (format: 'mp4' | 'webm') => {
    try {
      const result = await isSupported(buildEncoderConfig(format, settings));
      return result.supported === true;
    } catch {
      return false;
    }
  };
  const [mp4, webm] = await Promise.all([check('mp4'), check('webm')]);
  return { mp4, webm };
}

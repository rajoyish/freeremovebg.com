export type ModelMode = 'auto' | 'portrait' | 'general';

export const MOBILE_MAX_DIMENSION = 2048;

interface DeviceInfo {
  userAgent: string;
  maxTouchPoints?: number;
  deviceMemory?: number;
}

export function needsLowMemoryProcessing(device: DeviceInfo = navigator): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent)
    // iPadOS can advertise a desktop Mac user agent.
    || (/Macintosh|MacIntel/i.test(device.userAgent) && (device.maxTouchPoints ?? 0) > 1)
    || (device.deviceMemory !== undefined && device.deviceMemory <= 4);
}

export function removalPlan(mode: ModelMode, lowMemory: boolean) {
  return {
    detectPerson: mode === 'auto' && !lowMemory,
    generalModel: lowMemory ? 'isnet_quint8' as const : 'isnet_fp16' as const,
  };
}

export function fitDimensions(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

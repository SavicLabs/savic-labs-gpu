/** GPU statistics shared across the extension. */
export interface GpuStats {
  index: number;
  name: string;
  vramUsedMiB: number;
  vramTotalMiB: number;
  vramPercent: number;
  temperatureC: number;
  utilizationGpu: number;
  fanSpeed: number;
  powerDrawW: number;
  powerLimitW: number;
  driverVersion: string;
  processes: GpuProcess[];
  timestamp: number;
}

export interface GpuProcess {
  pid: number;
  name: string;
  vramMiB: number;
}

export type GpuVendor = 'nvidia' | 'amd' | 'apple' | 'intel' | 'unknown';

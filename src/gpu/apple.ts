/** Apple Silicon GPU stats via system_profiler + powermetrics (non-blocking). */
import type { GpuStats } from './types';
import { execAsync } from './exec';

export async function queryApple(): Promise<GpuStats[]> {
  try {
    const spOut = await execAsync('system_profiler SPDisplaysDataType 2>/dev/null');

    let chipName = 'Apple Silicon';
    let vramTotal = 0;

    // Parse chip name
    const chipMatch = spOut.match(/Chipset Model:\s*(.+)/);
    if (chipMatch) chipName = chipMatch[1].trim();

    // Parse VRAM (unified memory)
    const vramMatch = spOut.match(/VRAM \(Total\):\s*(\d+)\s*MB/);
    if (vramMatch) vramTotal = parseInt(vramMatch[1], 10);

    // Get current VRAM usage from powermetrics (snapshot)
    // Note: powermetrics requires root on macOS. Without root, this silently
    // fails and VRAM utilization will report 0. This is a platform limitation.
    let vramUsed = 0;
    let gpuUtil = 0;
    try {
      const pmOut = await execAsync('powermetrics --samplers gpu_power -n 1 -i 1000 2>/dev/null');
      const memMatch = pmOut.match(/GPU Memory Usage:\s*(\d+)\s*MB/);
      if (memMatch) vramUsed = parseInt(memMatch[1], 10);
      const utilMatch = pmOut.match(/GPU Active Residency:\s*([\d.]+)%/);
      if (utilMatch) gpuUtil = parseFloat(utilMatch[1]);
    } catch {
      // powermetrics may not be available
    }

    const stats: GpuStats = {
      index: 0,
      name: chipName,
      vramUsedMiB: vramUsed,
      vramTotalMiB: vramTotal || 0,
      vramPercent: vramTotal > 0 ? Math.round((vramUsed / vramTotal) * 100) : 0,
      temperatureC: 0,
      utilizationGpu: Math.round(gpuUtil),
      fanSpeed: 0,
      powerDrawW: 0,
      powerLimitW: 0,
      driverVersion: 'apple',
      processes: [],
      timestamp: Date.now(),
    };

    return [stats];
  } catch {
    return [];
  }
}

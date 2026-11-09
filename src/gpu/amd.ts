/** AMD GPU stats via rocm-smi (Linux) or WMI (Windows). */
import type { GpuStats } from './types';
import { execAsync } from './exec';
import { queryWindowsGpus } from './windows';

export async function queryAmd(): Promise<GpuStats[]> {
  // Linux: try rocm-smi
  if (process.platform !== 'win32') {
    const rocmStats = await queryRocm();
    if (rocmStats.length > 0) return rocmStats;
  }

  // Windows: use WMI
  if (process.platform === 'win32') {
    return queryWindowsGpus();
  }

  return [];
}

async function queryRocm(): Promise<GpuStats[]> {
  try {
    const out = await execAsync('rocm-smi --showmeminfo vram --showtemp --showuse --json 2>/dev/null');

    const data = JSON.parse(out);
    const cards = Array.isArray(data) ? data : Object.values(data);
    const stats: GpuStats[] = [];

    for (const [index, card] of (cards as Record<string, unknown>[]).entries()) {
      const c = card as Record<string, string>;
      const vramTotal = parseInt(c['VRAM Total Memory (B)'] || '0', 10) / (1024 * 1024);
      const vramUsed = parseInt(c['VRAM Used Memory (B)'] || '0', 10) / (1024 * 1024);

      stats.push({
        index,
        name: `AMD GPU ${index}`,
        vramUsedMiB: Math.round(vramUsed),
        vramTotalMiB: Math.round(vramTotal) || 1,
        vramPercent: vramTotal > 0 ? Math.round((vramUsed / vramTotal) * 100) : 0,
        temperatureC: parseInt(c['Temperature (Sensor edge)'] || '0', 10),
        utilizationGpu: parseInt(c['GPU use (%)'] || '0', 10),
        fanSpeed: 0,
        powerDrawW: 0,
        powerLimitW: 0,
        driverVersion: 'rocm',
        processes: [],
        timestamp: Date.now(),
      });
    }

    return stats;
  } catch {
    return [];
  }
}

/** Intel GPU stats — intel_gpu_top on Linux, WMI on Windows. */
import type { GpuStats } from './types';
import { execAsync } from './exec';
import { queryWindowsGpus } from './windows';

export async function queryIntel(): Promise<GpuStats[]> {
  if (process.platform === 'win32') {
    return queryWindowsGpus();
  }

  // Linux: intel_gpu_top
  try {
    const out = await execAsync('intel_gpu_top -J -s 1 -n 1 2>/dev/null');
    const data = JSON.parse(out);

    const stats: GpuStats[] = [];
    const engines = data?.engines || {};
    const clients = data?.clients || [];

    let cardIdx = 0;
    for (const [key, engine] of Object.entries(engines)) {
      const e = engine as Record<string, unknown>;
      const vramUsed = (e.memory as Record<string, number>)?.used || 0;
      const vramTotal = (e.memory as Record<string, number>)?.total || 0;

      const processes = (clients as Array<Record<string, unknown>>)
        .filter((c) => c.engine === key)
        .map((c) => ({
          pid: Number(c.pid) || 0,
          name: String(c.name || 'unknown'),
          vramMiB: Math.round(Number(c.memory) || 0),
        }));

      stats.push({
        index: cardIdx,
        name: `Intel GPU ${cardIdx}`,
        vramUsedMiB: Math.round(vramUsed),
        vramTotalMiB: Math.round(vramTotal) || 0,
        vramPercent: vramTotal > 0 ? Math.round((vramUsed / vramTotal) * 100) : 0,
        temperatureC: 0,
        utilizationGpu: Math.round(Number(e.busy) || 0),
        fanSpeed: 0,
        powerDrawW: 0,
        powerLimitW: 0,
        driverVersion: 'intel',
        processes,
        timestamp: Date.now(),
      });
      cardIdx++;
    }

    return stats;
  } catch {
    return [];
  }
}

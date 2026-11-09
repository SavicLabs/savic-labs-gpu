/** NVIDIA GPU stats via nvidia-smi with /proc fallback for driver mismatches. */
import { readdir, readFile } from 'node:fs/promises';
import { execAsync } from './exec';
import type { GpuStats, GpuProcess } from './types';

export async function queryNvidia(): Promise<GpuStats[]> {
  const smiStats = await queryNvidiaSmi();
  if (smiStats.length > 0) return smiStats;
  // /proc fallback only on Linux
  if (process.platform === 'linux') return queryNvidiaProc();
  return [];
}

async function queryNvidiaSmi(): Promise<GpuStats[]> {
  try {
    const out = await execAsync(
      'nvidia-smi --query-gpu=index,name,memory.used,memory.total,temperature.gpu,utilization.gpu,fan.speed,power.draw,power.limit,driver_version --format=csv,noheader,nounits'
    );
    const lines = out.trim().split('\n').filter((l: string) => l.trim());
    // Parse all GPU lines first, then query processes in parallel
    const parsed = lines.map((line: string) => {
      const parts = line.split(',').map((s: string) => s.trim());
      const index = parseInt(parts[0], 10);
      if (isNaN(index)) return undefined;
      const vramUsed = parseInt(parts[2], 10);
      const vramTotal = parseInt(parts[3], 10);
      return {
        index,
        name: parts[1] || 'NVIDIA GPU',
        vramUsedMiB: isNaN(vramUsed) ? 0 : vramUsed,
        vramTotalMiB: isNaN(vramTotal) ? 0 : vramTotal,
        temperatureC: parseInt(parts[4], 10) || 0,
        utilizationGpu: parseInt(parts[5], 10) || 0,
        fanSpeed: parseInt(parts[6], 10) || 0,
        powerDrawW: parseFloat(parts[7]) || 0,
        powerLimitW: parseFloat(parts[8]) || 0,
        driverVersion: parts[9] || 'unknown',
      };
    }).filter((p): p is NonNullable<typeof p> => p !== undefined);

    // Query processes for all GPUs in parallel (avoids sequential nvidia-smi calls)
    const processResults = await Promise.all(
      parsed.map((p) => queryNvidiaProcesses(p.index))
    );

    const stats: GpuStats[] = parsed.map((p, i) => ({
      ...p,
      vramPercent: 0,
      processes: processResults[i],
      timestamp: Date.now(),
    }));
    for (const s of stats) {
      s.vramPercent = s.vramTotalMiB > 0 ? Math.round((s.vramUsedMiB / s.vramTotalMiB) * 100) : 0;
    }
    return stats;
  } catch { return []; }
}

async function queryNvidiaProc(): Promise<GpuStats[]> {
  try {
    const entries = await readdir('/proc/driver/nvidia/gpus');
    const stats: GpuStats[] = [];
    for (const entry of entries) {
      try {
        const info = await readFile(`/proc/driver/nvidia/gpus/${entry}/information`, 'utf8');
        const modelMatch = info.match(/Model:\s*(.+)/);
        const name = modelMatch ? modelMatch[1].trim() : 'NVIDIA GPU';
        const vramMatch = info.match(/Total Memory:\s*(\d+)\s*MiB/);
        const vramTotal = vramMatch ? parseInt(vramMatch[1], 10) : 0;
        const minorMatch = info.match(/Device Minor:\s*(\d+)/);
        const index = minorMatch ? parseInt(minorMatch[1], 10) : stats.length;
        stats.push({
          index, name, vramUsedMiB: 0, vramTotalMiB: vramTotal, vramPercent: 0,
          temperatureC: 0, utilizationGpu: 0, fanSpeed: 0, powerDrawW: 0,
          powerLimitW: 0, driverVersion: 'nvidia (proc)', processes: [],
          timestamp: Date.now(),
        });
      } catch { /* skip unreadable GPU */ }
    }
    return stats;
  } catch { return []; }
}

async function queryNvidiaProcesses(gpuIndex: number): Promise<GpuProcess[]> {
  try {
    const out = await execAsync(
      `nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits --id=${gpuIndex}`
    );
    const processes: GpuProcess[] = [];
    for (const line of out.trim().split('\n').filter((l: string) => l.trim())) {
      const parts = line.split(',').map((s: string) => s.trim());
      const pid = parseInt(parts[0], 10);
      processes.push({ pid: isNaN(pid) ? 0 : pid, name: parts[1] || 'unknown', vramMiB: parseInt(parts[2], 10) || 0 });
    }
    return processes;
  } catch { return []; }
}

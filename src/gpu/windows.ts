/** Shared Windows WMI GPU queries — used by AMD and Intel on Windows. */
import { execAsync } from './exec';
import type { GpuStats } from './types';

/** Query all non-NVIDIA GPUs on Windows via WMI + Performance Counters. */
export async function queryWindowsGpus(): Promise<GpuStats[]> {
  const [controllers, memUsage, gpuUtil] = await Promise.all([
    queryWmiControllers(),
    queryGpuMemoryCounters(),
    queryGpuUtilization(),
  ]);

  const stats: GpuStats[] = [];
  let index = 0;

  for (const ctrl of controllers) {
    // Skip NVIDIA — those are handled by nvidia.ts
    const nameLower = ctrl.name.toLowerCase();
    if (nameLower.includes('nvidia')) continue;

    // NOTE: Win32_VideoController.AdapterRAM is a 32-bit unsigned int that
    // overflows at 4 GiB. GPUs with >4GB VRAM will report incorrect totals.
    // NVIDIA GPUs are handled by nvidia-smi instead; this affects AMD/Intel.
    const vramTotal = Math.round(ctrl.adapterRamBytes / (1024 * 1024));

    // Match memory counter by GPU name substring
    const memKey = findCounterKey(memUsage, ctrl.name);
    const utilKey = findCounterKey(gpuUtil, ctrl.name);

    const vramUsed = memKey ? Math.round(memUsage[memKey] / (1024 * 1024)) : 0;
    const util = utilKey ? Math.round(gpuUtil[utilKey]) : 0;

    stats.push({
      index: index++,
      name: ctrl.name,
      vramUsedMiB: vramUsed,
      vramTotalMiB: vramTotal || 1,
      vramPercent: vramTotal > 0 ? Math.round((vramUsed / vramTotal) * 100) : 0,
      temperatureC: 0,
      utilizationGpu: util,
      fanSpeed: 0,
      powerDrawW: 0,
      powerLimitW: 0,
      driverVersion: 'windows',
      processes: [],
      timestamp: Date.now(),
    });
  }

  return stats;
}

interface WmiController {
  name: string;
  adapterRamBytes: number;
}

async function queryWmiControllers(): Promise<WmiController[]> {
  try {
    const out = await execAsync(
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-WmiObject Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json"',
      8000
    );
    const parsed = JSON.parse(out);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((item: Record<string, unknown>) => ({
      name: String(item.Name || 'Unknown GPU'),
      adapterRamBytes: typeof item.AdapterRAM === 'number' ? item.AdapterRAM : 0,
    }));
  } catch {
    return [];
  }
}

async function queryGpuMemoryCounters(): Promise<Record<string, number>> {
  try {
    const out = await execAsync(
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Counter \'\\GPU Adapter Memory(*)\\Dedicated Usage\' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object InstanceName,CookedValue | ConvertTo-Json"',
      8000
    );
    const parsed = JSON.parse(out);
    const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    const result: Record<string, number> = {};
    for (const item of items) {
      result[String(item.InstanceName || '')] = Number(item.CookedValue || 0);
    }
    return result;
  } catch {
    return {};
  }
}

async function queryGpuUtilization(): Promise<Record<string, number>> {
  try {
    const out = await execAsync(
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Counter \'\\GPU Engine(*engtype_3d)\\Utilization Percentage\' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object InstanceName,CookedValue | ConvertTo-Json"',
      8000
    );
    const parsed = JSON.parse(out);
    const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    const result: Record<string, number> = {};
    for (const item of items) {
      result[String(item.InstanceName || '')] = Number(item.CookedValue || 0);
    }
    return result;
  } catch {
    return {};
  }
}

/** Find a counter key that contains the GPU name substring. */
function findCounterKey(counters: Record<string, number>, gpuName: string): string | undefined {
  const nameLower = gpuName.toLowerCase();
  // Try exact or substring match against counter keys
  for (const key of Object.keys(counters)) {
    if (key.toLowerCase().includes(nameLower.substring(0, 8))) return key;
    if (nameLower.includes(key.toLowerCase().substring(0, 8))) return key;
  }
  // Fallback: first key
  return Object.keys(counters)[0];
}

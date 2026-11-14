/** Intel GPU stats — intel_gpu_top on Linux, WMI on Windows. */
import type { GpuStats } from './types';
import { execAsync } from './exec';
import { queryWindowsGpus } from './windows';

/** Engine whose busy percentage is used as the headline utilisation figure. */
const UTILISATION_ENGINE = 'Render/3D';

export async function queryIntel(): Promise<GpuStats[]> {
  if (process.platform === 'win32') {
    return queryWindowsGpus();
  }

  try {
    // -J prints JSON, -s sets the sample period, -n 1 keeps it to one sample.
    const out = await execAsync('intel_gpu_top -J -s 1000 -n 1 2>/dev/null');
    const stats = parseIntelSample(out);
    return stats ? [stats] : [];
  } catch {
    return [];
  }
}

interface IntelEngine {
  busy?: number;
}

interface IntelSample {
  engines?: Record<string, IntelEngine>;
  clients?: Array<{ pid?: number; name?: string; engine?: string; memory?: number }>;
}

/**
 * Parse one `intel_gpu_top -J` sample.
 *
 * `intel_gpu_top` reports per-engine busy percentages, not a device-level
 * figure. Summing them would be wrong: a frame can occupy several engines at
 * once, so the total easily exceeds 100%. GPU utilisation is therefore the
 * Render/3D engine's busy value, falling back to the busiest engine when that
 * engine is not reported.
 *
 * Memory is not part of this output at all — integrated Intel GPUs share system
 * RAM — so the VRAM fields stay at zero rather than inventing a figure.
 */
export function parseIntelSample(raw: string): GpuStats | undefined {
  const parsed: unknown = JSON.parse(raw);
  const sample = (Array.isArray(parsed) ? parsed[0] : parsed) as IntelSample | undefined;
  if (!sample || typeof sample !== 'object') {
    return undefined;
  }

  const engines = sample.engines ?? {};
  const renderBusy = Number(engines[UTILISATION_ENGINE]?.busy);
  const busyValues = Object.values(engines)
    .map((engine) => Number(engine?.busy))
    .filter((value) => Number.isFinite(value));

  let utilization = 0;
  if (Number.isFinite(renderBusy)) {
    utilization = renderBusy;
  } else if (busyValues.length > 0) {
    utilization = Math.max(...busyValues);
  }

  const processes = (sample.clients ?? []).map((client) => ({
    pid: Number(client?.pid) || 0,
    name: String(client?.name ?? 'unknown'),
    // intel_gpu_top reports client memory in bytes; the shared type is MiB.
    vramMiB: Math.round((Number(client?.memory) || 0) / (1024 * 1024)),
  }));

  return {
    index: 0,
    name: 'Intel GPU',
    vramUsedMiB: 0,
    vramTotalMiB: 0,
    vramPercent: 0,
    temperatureC: 0,
    utilizationGpu: Math.round(utilization),
    fanSpeed: 0,
    powerDrawW: 0,
    powerLimitW: 0,
    driverVersion: 'intel',
    processes,
    timestamp: Date.now(),
  };
}

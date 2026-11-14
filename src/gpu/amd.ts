/** AMD GPU stats via rocm-smi (Linux) or WMI (Windows). */
import type { GpuStats } from './types';
import { execAsync } from './exec';
import { queryWindowsGpus } from './windows';

const BYTES_PER_MIB = 1024 * 1024;

export async function queryAmd(): Promise<GpuStats[]> {
  if (process.platform === 'win32') {
    return queryWindowsGpus();
  }

  const rocmStats = await queryRocm();
  return rocmStats;
}

async function queryRocm(): Promise<GpuStats[]> {
  try {
    const out = await execAsync(
      'rocm-smi --showmeminfo vram --showtemp --showuse --json 2>/dev/null'
    );
    return parseRocmOutput(out);
  } catch {
    return [];
  }
}

/**
 * Parse `rocm-smi --json` output.
 *
 * The payload is an object keyed by device (`card0`, `card1`, …) which also
 * contains a `system` entry describing the host, not a GPU. Enumerating every
 * value produced a phantom device and shifted the indices of the real cards, so
 * only `card*` keys are treated as devices. Keys are sorted numerically because
 * JSON object order is not guaranteed past `card9`.
 */
export function parseRocmOutput(raw: string): GpuStats[] {
  const data: unknown = JSON.parse(raw);

  const cards: unknown[] = Array.isArray(data)
    ? data
    : Object.entries(data as Record<string, unknown>)
        .filter(([key]) => /^card\d+$/i.test(key))
        .sort(([a], [b]) => cardNumber(a) - cardNumber(b))
        .map(([, value]) => value);

  const stats: GpuStats[] = [];

  for (const [index, card] of cards.entries()) {
    const values = (card ?? {}) as Record<string, string>;
    const vramTotal = toNumber(values['VRAM Total Memory (B)']) / BYTES_PER_MIB;
    const vramUsed = toNumber(values['VRAM Used Memory (B)']) / BYTES_PER_MIB;

    stats.push({
      index,
      name: `AMD GPU ${index}`,
      vramUsedMiB: Math.round(vramUsed),
      vramTotalMiB: Math.round(vramTotal),
      vramPercent: vramTotal > 0 ? Math.round((vramUsed / vramTotal) * 100) : 0,
      temperatureC: toNumber(values['Temperature (Sensor edge)']),
      utilizationGpu: toNumber(values['GPU use (%)']),
      fanSpeed: 0,
      powerDrawW: 0,
      powerLimitW: 0,
      driverVersion: 'rocm',
      processes: [],
      timestamp: Date.now(),
    });
  }

  return stats;
}

function toNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cardNumber(key: string): number {
  return Number.parseInt(key.replace(/\D/g, ''), 10) || 0;
}

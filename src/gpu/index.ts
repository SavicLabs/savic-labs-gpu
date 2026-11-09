/** GPU query dispatcher — routes to the correct vendor parser. */
import { detectVendor, resetVendor } from './detector';
import { queryNvidia } from './nvidia';
import { queryAmd } from './amd';
import { queryApple } from './apple';
import { queryIntel } from './intel';
import type { GpuStats, GpuVendor } from './types';

let cachedVendor: GpuVendor | undefined;

export async function queryGpu(): Promise<{ vendor: GpuVendor; stats: GpuStats[] }> {
  if (!cachedVendor) {
    cachedVendor = await detectVendor();
  }

  let stats: GpuStats[] = [];

  switch (cachedVendor) {
    case 'nvidia': stats = await queryNvidia(); break;
    case 'amd': stats = await queryAmd(); break;
    case 'apple': stats = await queryApple(); break;
    case 'intel': stats = await queryIntel(); break;
    default: break;
  }

  return { vendor: cachedVendor, stats };
}

export function clearVendorCache(): void {
  cachedVendor = undefined;
  resetVendor();
}

export type { GpuStats, GpuVendor };

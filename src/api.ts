/** Public API exposed to other VS Code extensions. */
import type { GpuStats } from './gpu/types';

export interface SavicLabsGpuApi {
  /** Get current GPU statistics for all detected GPUs. */
  getGpuStats(): GpuStats[];

  /** Get total available VRAM (free) across all GPUs in MiB. */
  getAvailableVram(): number;

  /** Check if a model needing vramNeededMiB can fit in available VRAM. */
  canFitModel(vramNeededMiB: number): boolean;

  /** Force an immediate GPU stats refresh. */
  refresh(): void;
}

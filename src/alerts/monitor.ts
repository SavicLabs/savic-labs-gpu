/** Alert monitor — checks VRAM and temperature thresholds. */
import * as vscode from 'vscode';
import type { GpuStats } from '../gpu/types';
import { alertVramPercent, alertTempCelsius } from '../config';

interface AlertState {
  vramAlerted: boolean;
  tempAlerted: boolean;
}

export class AlertMonitor {
  private state: Map<number, AlertState> = new Map();

  check(statsList: GpuStats[]): void {
    // Clean up state for GPUs that no longer exist
    const activeIndices = new Set(statsList.map((s) => s.index));
    for (const idx of this.state.keys()) {
      if (!activeIndices.has(idx)) this.state.delete(idx);
    }

    for (const stats of statsList) {
      let s = this.state.get(stats.index);
      if (!s) {
        s = { vramAlerted: false, tempAlerted: false };
        this.state.set(stats.index, s);
      }

      const vramThreshold = alertVramPercent();
      const tempThreshold = alertTempCelsius();

      // VRAM alert
      if (stats.vramPercent >= vramThreshold && !s.vramAlerted) {
        s.vramAlerted = true;
        // Copy before sort to avoid mutating the shared stats array
        const topProcesses = [...stats.processes]
          .sort((a, b) => b.vramMiB - a.vramMiB)
          .slice(0, 3)
          .map((p) => `  ${p.name} (${p.vramMiB}MB)`)
          .join('\n');

        void vscode.window.showWarningMessage(
          `GPU ${stats.index}: VRAM at ${stats.vramPercent}% (${stats.vramUsedMiB}/${stats.vramTotalMiB} MB)\n\nTop consumers:\n${topProcesses || '  No process data'}`,
          'Open Panel'
        ).then((choice) => {
          if (choice === 'Open Panel') {
            void vscode.commands.executeCommand('savicLabsGpu.openPanel');
          }
        });
      } else if (stats.vramPercent < vramThreshold - 5) {
        s.vramAlerted = false; // Reset when drops 5% below threshold
      }

      // Temperature alert
      if (stats.temperatureC >= tempThreshold && !s.tempAlerted) {
        s.tempAlerted = true;
        void vscode.window.showWarningMessage(
          `GPU ${stats.index}: Temperature at ${stats.temperatureC}°C — approaching thermal throttle`
        );
      } else if (stats.temperatureC < tempThreshold - 10) {
        s.tempAlerted = false;
      }
    }
  }

  reset(): void {
    this.state.clear();
  }
}

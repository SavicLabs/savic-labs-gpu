/** Status bar widget — shows GPU stats in the VS Code status bar. */
import * as vscode from 'vscode';
import type { GpuStats } from '../gpu/types';
import { statusBarFormat, showUtilization } from '../config';

export class GpuStatusBar {
  private item: vscode.StatusBarItem;
  private currentGpuIndex = 0;
  private gpuCount = 0;
  private lastStatsList: GpuStats[] | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'savicLabsGpu.openPanel';
    this.item.tooltip = 'SavicLabs GPU Monitor — click for detail panel';
    this.item.show();
  }

  update(statsList: GpuStats[]): void {
    this.lastStatsList = statsList;
    if (statsList.length === 0) {
      this.item.text = '$(device-desktop) No GPU';
      this.item.backgroundColor = undefined;
      return;
    }

    this.gpuCount = statsList.length;

    // Cycle through GPUs on click if multiple
    if (this.currentGpuIndex >= statsList.length) {
      this.currentGpuIndex = 0;
    }

    const stats = statsList[this.currentGpuIndex];
    const vramUsed = formatVram(stats.vramUsedMiB);
    const vramTotal = formatVram(stats.vramTotalMiB);

    let text = statusBarFormat()
      .replace('${name}', stats.name)
      .replace('${vramUsed}', vramUsed)
      .replace('${vramTotal}', vramTotal)
      .replace('${vramPercent}', `${stats.vramPercent}%`)
      .replace('${temp}', `${stats.temperatureC}`)
      .replace('${util}', `${stats.utilizationGpu}`);

    if (showUtilization()) {
      text += ` · ${stats.utilizationGpu}%`;
    }

    // Multi-GPU indicator
    if (statsList.length > 1) {
      text += ` [${this.currentGpuIndex + 1}/${statsList.length}]`;
    }

    this.item.text = `$(server) ${text}`;

    // Temperature color coding
    if (stats.temperatureC >= 85) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (stats.temperatureC >= 75) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.backgroundColor = undefined;
    }

    // Tooltip with all GPUs
    const tooltipLines = statsList.map((s) => {
      const bar = vramBar(s.vramPercent);
      return `${s.name}\n${bar} ${s.vramPercent}% · ${formatVram(s.vramUsedMiB)}/${formatVram(s.vramTotalMiB)} · ${s.temperatureC}°C · ${s.utilizationGpu}% util`;
    });
    this.item.tooltip = tooltipLines.join('\n\n');
  }

  cycleGpu(): void {
    this.currentGpuIndex = (this.currentGpuIndex + 1) % Math.max(1, this.gpuCount);
    // Refresh display immediately if we have cached stats
    if (this.lastStatsList) this.update(this.lastStatsList);
  }

  dispose(): void {
    this.item.dispose();
  }
}

function formatVram(mib: number): string {
  if (mib >= 1024) return `${(mib / 1024).toFixed(1)}GB`;
  return `${mib}MB`;
}

function vramBar(percent: number): string {
  const blocks = 10;
  const filled = Math.round((percent / 100) * blocks);
  return '█'.repeat(filled) + '░'.repeat(blocks - filled);
}

/**
 * SavicLabs GPU Monitor — extension entry point.
 * Real-time GPU stats in the VS Code status bar.
 */
import * as vscode from 'vscode';
import { queryGpu, type GpuStats } from './gpu';
import { GpuStatusBar } from './statusbar/widget';
import { GpuDetailPanel } from './panel/provider';
import { AlertMonitor } from './alerts/monitor';
import { isEnabled, pollIntervalMs } from './config';
import type { SavicLabsGpuApi } from './api';

let statusBar: GpuStatusBar | undefined;
let panel: GpuDetailPanel | undefined;
let alertMonitor: AlertMonitor | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let currentStats: GpuStats[] = [];

export function activate(context: vscode.ExtensionContext): SavicLabsGpuApi {
  const enabled = isEnabled();
  if (enabled) {
    statusBar = new GpuStatusBar();
    alertMonitor = new AlertMonitor();
    pollTimer = setInterval(poll, pollIntervalMs());
    poll();
  }

  // Always register commands so user can toggle from disabled state
  context.subscriptions.push(
    vscode.commands.registerCommand('savicLabsGpu.toggle', () => {
      const config = vscode.workspace.getConfiguration('savicLabsGpu');
      const currentlyEnabled = config.get<boolean>('enabled', true);
      void config.update('enabled', !currentlyEnabled, vscode.ConfigurationTarget.Global);
      if (!currentlyEnabled) {
        // Enable
        statusBar = statusBar || new GpuStatusBar();
        alertMonitor = alertMonitor || new AlertMonitor();
        if (currentStats.length > 0) statusBar.update(currentStats);
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(poll, pollIntervalMs());
        poll();
      } else {
        // Disable — dispose instances so they don't leak
        if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined; }
        if (statusBar) { statusBar.dispose(); statusBar = undefined; }
        if (alertMonitor) { alertMonitor.reset(); alertMonitor = undefined; }
      }
      void vscode.window.showInformationMessage(
        `GPU Monitor ${!currentlyEnabled ? 'enabled' : 'disabled'}.`
      );
    }),
    vscode.commands.registerCommand('savicLabsGpu.cycleGpu', () => {
      if (statusBar) statusBar.cycleGpu();
    }),
    vscode.commands.registerCommand('savicLabsGpu.openPanel', () => {
      panel = GpuDetailPanel.createOrShow(context);
      panel.update(currentStats);
    }),
    vscode.commands.registerCommand('savicLabsGpu.refresh', () => {
      void poll();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('savicLabsGpu.pollIntervalMs') && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = setInterval(poll, pollIntervalMs());
      }
      // Refresh status bar immediately on format/utilization config changes
      if (e.affectsConfiguration('savicLabsGpu.statusBarFormat') || e.affectsConfiguration('savicLabsGpu.showUtilization')) {
        if (statusBar && currentStats.length > 0) statusBar.update(currentStats);
      }
    })
  );

  return createApi();
}

async function poll(): Promise<void> {
  try {
    const { stats } = await queryGpu();
    currentStats = stats;

    if (statusBar) statusBar.update(stats);
    if (panel) panel.update(stats);
    if (alertMonitor) alertMonitor.check(stats);
  } catch (error) {
    // Log polling errors for diagnostics instead of silently swallowing
    if (error instanceof Error) {
      console.warn(`[SavicLabs GPU] Poll error: ${error.message}`);
    }
  }
}

export function deactivate(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined; }
  if (statusBar) { statusBar.dispose(); statusBar = undefined; }
  if (panel) { panel.dispose(); panel = undefined; }
  if (alertMonitor) { alertMonitor.reset(); alertMonitor = undefined; }
}

function createApi(): SavicLabsGpuApi {
  return {
    getGpuStats(): GpuStats[] {
      // Return a snapshot to prevent external mutation
      return currentStats.map((s) => ({ ...s, processes: [...s.processes] }));
    },
    getAvailableVram(): number {
      return currentStats.reduce(
        (sum, s) => sum + (s.vramTotalMiB - s.vramUsedMiB),
        0
      );
    },
    canFitModel(vramNeededMiB: number): boolean {
      return this.getAvailableVram() >= vramNeededMiB;
    },
    refresh(): void {
      void poll();
    },
  };
}

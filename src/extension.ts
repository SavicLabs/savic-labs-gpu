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
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollLoopActive = false;
let currentStats: GpuStats[] = [];

export function activate(context: vscode.ExtensionContext): SavicLabsGpuApi {
  if (isEnabled()) {
    statusBar = new GpuStatusBar();
    alertMonitor = new AlertMonitor();
    startPolling();
  }

  // Commands stay registered even when polling is disabled, so the extension
  // can be switched back on from the Command Palette.
  context.subscriptions.push(
    vscode.commands.registerCommand('savicLabsGpu.toggle', () => {
      const config = vscode.workspace.getConfiguration('savicLabsGpu');
      const currentlyEnabled = config.get<boolean>('enabled', true);
      void config.update('enabled', !currentlyEnabled, vscode.ConfigurationTarget.Global);

      if (!currentlyEnabled) {
        statusBar = statusBar ?? new GpuStatusBar();
        alertMonitor = alertMonitor ?? new AlertMonitor();
        if (currentStats.length > 0) statusBar.update(currentStats);
        startPolling();
      } else {
        stopPolling();
        statusBar?.dispose();
        statusBar = undefined;
        alertMonitor?.reset();
        alertMonitor = undefined;
      }

      void vscode.window.showInformationMessage(
        `GPU Monitor ${!currentlyEnabled ? 'enabled' : 'disabled'}.`
      );
    }),
    vscode.commands.registerCommand('savicLabsGpu.cycleGpu', () => {
      statusBar?.cycleGpu();
    }),
    vscode.commands.registerCommand('savicLabsGpu.openPanel', () => {
      panel = GpuDetailPanel.createOrShow(context);
      panel.update(currentStats);
    }),
    vscode.commands.registerCommand('savicLabsGpu.refresh', () => {
      void poll();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('savicLabsGpu.enabled')) {
        // The setting can be changed from the Settings UI as well as the
        // toggle command; keep the polling loop in step with it.
        if (isEnabled() && !pollLoopActive) {
          statusBar = statusBar ?? new GpuStatusBar();
          alertMonitor = alertMonitor ?? new AlertMonitor();
          startPolling();
        } else if (!isEnabled() && pollLoopActive) {
          stopPolling();
          statusBar?.dispose();
          statusBar = undefined;
          alertMonitor?.reset();
          alertMonitor = undefined;
        }
      }
      if (e.affectsConfiguration('savicLabsGpu.pollIntervalMs') && pollLoopActive) {
        // Re-arm the timer so the new interval takes effect immediately.
        stopPolling();
        startPolling();
      }
      if (
        e.affectsConfiguration('savicLabsGpu.statusBarFormat') ||
        e.affectsConfiguration('savicLabsGpu.showUtilization')
      ) {
        if (statusBar && currentStats.length > 0) statusBar.update(currentStats);
      }
    })
  );

  return createApi();
}

/**
 * Poll on a self-rescheduling timer rather than setInterval.
 *
 * GPU queries can take longer than the polling interval on a busy machine
 * (nvidia-smi alone is often 100–300 ms, more with several GPUs). With
 * setInterval those calls would pile up and every queued tick would run a
 * second query, which is exactly the sort of overhead this extension must not
 * add. Scheduling the next poll only after the previous one settles keeps at
 * most one query in flight.
 */
function startPolling(): void {
  if (pollLoopActive) return;
  pollLoopActive = true;
  void runPollLoop();
}

function stopPolling(): void {
  pollLoopActive = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  }
}

async function runPollLoop(): Promise<void> {
  await poll();
  if (!pollLoopActive) return;
  pollTimer = setTimeout(() => void runPollLoop(), pollIntervalMs());
}

async function poll(): Promise<void> {
  try {
    const { stats } = await queryGpu();
    currentStats = stats;

    statusBar?.update(stats);
    panel?.update(stats);
    alertMonitor?.check(stats);
  } catch (error) {
    // Polling errors are logged rather than surfaced: a failing query must not
    // interrupt the user, and the next tick may well succeed.
    if (error instanceof Error) {
      console.warn(`[SavicLabs GPU] Poll error: ${error.message}`);
    }
  }
}

export function deactivate(): void {
  stopPolling();
  statusBar?.dispose();
  statusBar = undefined;
  panel?.dispose();
  panel = undefined;
  alertMonitor?.reset();
  alertMonitor = undefined;
}

function createApi(): SavicLabsGpuApi {
  const api: SavicLabsGpuApi = {
    getGpuStats(): GpuStats[] {
      // Snapshot, so callers cannot mutate live state.
      return currentStats.map((s) => ({ ...s, processes: [...s.processes] }));
    },
    getAvailableVram(): number {
      return currentStats.reduce((sum, s) => sum + Math.max(0, s.vramTotalMiB - s.vramUsedMiB), 0);
    },
    canFitModel(vramNeededMiB: number): boolean {
      return api.getAvailableVram() >= vramNeededMiB;
    },
    refresh(): void {
      void poll();
    },
  };
  return api;
}

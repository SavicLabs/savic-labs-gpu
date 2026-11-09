/** Runtime configuration reader with value clamping for safety. */
import * as vscode from 'vscode';

const SECTION = 'savicLabsGpu';

function cfg<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration(SECTION).get<T>(key) ?? fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function isEnabled(): boolean { return cfg('enabled', true); }
export function pollIntervalMs(): number { return clamp(cfg('pollIntervalMs', 2000), 500, 60_000); }
export function alertVramPercent(): number { return clamp(cfg('alertVramPercent', 85), 1, 100); }
export function alertTempCelsius(): number { return clamp(cfg('alertTempCelsius', 85), 1, 200); }
export function statusBarFormat(): string { return cfg('statusBarFormat', 'GPU ${name} · ${vramUsed}/${vramTotal} · ${temp}°C'); }
export function showUtilization(): boolean { return cfg('showUtilization', false); }

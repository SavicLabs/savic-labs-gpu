/** Auto-detect GPU vendor. Caches result after first detection. */
import { exec } from 'node:child_process';
import type { GpuVendor } from './types';

let cachedVendor: GpuVendor | undefined;

/** Promise-based exec helper with timeout. */
function execAsync(cmd: string, timeoutMs: number = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** Check if a command exists on the system (non-blocking). */
async function cmdExistsAsync(cmd: string): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      await execAsync(`where ${cmd}`, 2000);
    } else {
      await execAsync(`command -v ${cmd}`, 2000);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect GPU vendor. Async to avoid blocking the extension host thread.
 * Caches result after first detection.
 */
export async function detectVendor(): Promise<GpuVendor> {
  if (cachedVendor) return cachedVendor;

  // Windows: WMI is authoritative — detects actual hardware, not just installed tools
  if (process.platform === 'win32') {
    const wmiVendor = await detectWindowsVendor();
    if (wmiVendor) return wmiVendor;
  }

  if (await cmdExistsAsync('nvidia-smi')) { cachedVendor = 'nvidia'; return cachedVendor; }
  if (await cmdExistsAsync('rocm-smi')) { cachedVendor = 'amd'; return cachedVendor; }

  if (process.platform === 'darwin') {
    try {
      const out = await execAsync('system_profiler SPDisplaysDataType 2>/dev/null', 3000);
      if (/Apple.*M[1-9]/.test(out)) { cachedVendor = 'apple'; return cachedVendor; }
    } catch { /* ignore */ }
  }

  if (await cmdExistsAsync('intel_gpu_top')) { cachedVendor = 'intel'; return cachedVendor; }

  cachedVendor = 'unknown';
  return cachedVendor;
}

/** Detect GPU vendor via WMI on Windows. Returns null if WMI unavailable. */
async function detectWindowsVendor(): Promise<GpuVendor | null> {
  try {
    const out = await execAsync(
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-WmiObject Win32_VideoController | Select-Object -ExpandProperty Name"',
      8000
    );
    const nameLower = out.toLowerCase();
    // Prefer dedicated GPUs: NVIDIA > AMD > Intel
    if (nameLower.includes('nvidia')) { cachedVendor = 'nvidia'; return cachedVendor; }
    if (nameLower.includes('amd') || nameLower.includes('radeon')) { cachedVendor = 'amd'; return cachedVendor; }
    if (nameLower.includes('intel') || nameLower.includes('arc') || nameLower.includes('iris') || nameLower.includes('uhd')) { cachedVendor = 'intel'; return cachedVendor; }
  } catch { /* PowerShell unavailable, fall through to cmdExists */ }
  return null;
}

export function resetVendor(): void {
  cachedVendor = undefined;
}

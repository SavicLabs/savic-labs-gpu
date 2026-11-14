# Changelog

All notable changes to the SavicLabs GPU Monitor extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] — 2026-11-13

### Fixed
- **AMD: phantom GPU and shifted indices** — `rocm-smi --json` returns a non-GPU
  `system` entry alongside `card0…cardN`. Enumerating every value created a fake
  device and renumbered the real ones. Only `card*` keys are used now, sorted numerically.
- **Intel: no devices at all on Linux** — `intel_gpu_top -J` emits an array of samples;
  the parser treated it as an object, so Intel GPUs always reported zero stats.
- **Intel: engines were reported as separate GPUs** — one physical GPU now yields one
  device. Utilisation is the Render/3D engine's busy value, not a sum of engines, which
  could exceed 100%.
- **Intel: client memory was labelled MiB but reported in bytes.**
- **Windows: unmatched performance counters fell back to the first key**, attributing one
  GPU's memory to another. Unknown totals now report 0 instead of a fake 1 MiB.
- **Detail panel: the theme-accent regex never matched**, because its backslashes were
  consumed by the template literal, so the chart always used the default colour.
- **Polling could overlap** — `setInterval` with an async query queued a second query
  while the first was still running. Polling now reschedules after each completion.
- `savicLabsGpu.enabled` changed from the Settings UI was ignored; only the toggle
  command worked. The panel is also disposed when polling stops.

### Added
- LICENSE file (the manifest declared MIT but the repository had none).
- Parser tests, oxlint, and a CI workflow.

### Notes
- Intel reports no memory figures; `intel_gpu_top` does not expose them, and
  integrated GPUs share system RAM. VRAM fields read as zero rather than estimated.
- Intel multi-GPU is not supported; one sample is read and reported as one device.

## [Unreleased]

## [0.2.1] — 2026-07-29

### Fixed — Hardening Pass
- **Intel GPU off-by-one naming** — `cardIdx++` post-increment caused first GPU to show `index: 0, name: "Intel GPU 1"`. Fixed to use `cardIdx` before increment for both index and name.
- **VRAM total NaN default** — `vramTotalMiB` defaulted to `1` on parse failure in `nvidia.ts` and `intel.ts`, producing absurd percentages (e.g., 200000%) and alert spam. Now defaults to `0`.
- **Config value clamping** — `pollIntervalMs`, `alertVramPercent`, and `alertTempCelsius` were read raw with no bounds. A user setting `pollIntervalMs: 10` would cause CPU thrashing. Now clamped to safe ranges.
- **Toggle leaks StatusBar and AlertMonitor** — Disabling via toggle didn't dispose instances. Now properly disposes and sets to `undefined`.
- **Poll errors silently swallowed** — `poll()` caught all errors with no logging. Now logs to `console.warn` for diagnostics.
- **`escHtml` doesn't escape quotes** — Single and double quotes were unescaped, a potential XSS vector if process/GPU names were ever inserted into HTML attributes. Now escapes `"` and `'`.
- **WebView no Content Security Policy** — Added CSP meta tag restricting to inline scripts/styles only.

## [0.2.0] — 2026-07-28

### Fixed — Critical Bugs
- **Array mutation in alert monitor** — `AlertMonitor.check()` sorted `stats.processes` in-place via `Array.prototype.sort`, corrupting the shared stats array used by the status bar and panel. Now copies the array before sorting.
- **Blocking `execSync` in vendor detection** — `detectVendor()` and `cmdExists()` used `execSync` with timeouts up to 8s, which could freeze the VS Code UI on Windows (PowerShell cold-start). Converted to async `exec` with `Promise`-based helper. `detectVendor()` is now async.
- **Duplicate poll timer in toggle** — Enabling the monitor via `toggle` command could create a second `setInterval` without clearing the first if called while already enabled. Now clears existing timer before creating a new one.
- **Canvas CSS variable bug** — Panel chart used `var(--vscode-font-family)` in `ctx.font` and `var(--vscode-editor-background)` in `ctx.strokeStyle`. The Canvas 2D API only accepts concrete color strings, not CSS variables. Now resolves via `getComputedStyle()` first.

### Changed — Performance
- **Parallel NVIDIA process queries** — `queryNvidiaSmi()` now queries per-GPU process lists in parallel via `Promise.all` instead of sequential `await` per GPU. Eliminates N+1 sequential `nvidia-smi` calls on multi-GPU systems.
- **Intel GPU sample window** — Reduced `intel_gpu_top` sample window from 500ms to 1ms (`-s 1 -n 1`). Previously consumed 25% of each 2s poll cycle waiting for a sample.

### Changed — Hardening
- **`cycleGpu` refreshes immediately** — Cycling GPUs in the status bar now updates the display instantly instead of waiting up to 2s for the next poll.
- **Config change handling** — `statusBarFormat` and `showUtilization` changes now refresh the status bar immediately instead of waiting for the next poll.
- **`deactivate` cleans up AlertMonitor** — Calls `alertMonitor.reset()` to clear alert state on deactivation.
- **TypeScript strictness** — Enabled `noUnusedLocals` and `noUnusedParameters` in `tsconfig.json`.
- **`.vscodeignore`** — Added `*.vsix` to prevent accidental packaging of build artifacts.

### Removed — Cleanup
- Removed old .vsix files (0.1.0, 0.1.2) from repository
- Removed unused `context` parameter in `GpuDetailPanel` private constructor

### Documentation
- Documented `AdapterRAM` 4 GiB overflow limitation in `windows.ts` (affects AMD/Intel on Windows)
- Documented `powermetrics` root requirement in `apple.ts` (affects VRAM/utilization on macOS)

## [0.1.2] — Initial Release

- Real-time GPU stats in VS Code status bar
- VRAM, temperature, utilization, power, fan speed
- Detail panel with per-GPU breakdown, process list, and VRAM history chart
- Alert monitoring for VRAM and temperature thresholds
- NVIDIA, AMD, Intel, Apple Silicon support
- Linux, Windows, macOS support
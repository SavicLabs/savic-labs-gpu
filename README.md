# SavicLabs GPU Monitor

Real-time GPU monitor in your VS Code status bar. Shows VRAM, temperature, utilization — click for detailed panel with process list and history charts.

---

## Features

- **Status bar widget** — VRAM usage, temperature, utilization at a glance
- **Detail panel** — per-GPU breakdown, VRAM bar, process list, 5-minute history graph
- **Multi-GPU** — cycle through GPUs, or see all in the panel
- **Smart alerts** — warns when VRAM exceeds 85% or GPU runs hot
- **Zero config** — auto-detects NVIDIA, AMD, Apple Silicon, Intel Arc
- **Extension API** — other extensions can query GPU state

## Supported Hardware

| Vendor | Linux | Windows | macOS |
|---|---|---|---|
| **NVIDIA** | ✅ nvidia-smi + /proc fallback | ✅ nvidia-smi | — |
| **AMD** | ✅ rocm-smi | ✅ WMI | — |
| **Apple Silicon** | — | — | ✅ system_profiler |
| **Intel Arc / UHD / Iris** | ✅ intel_gpu_top | ✅ WMI | — |

## Usage

Once installed, the GPU status appears in the status bar:

```
GPU RTX 3060 · 8.2GB/12GB · 52°C
```

**Click** the status bar item to open the detail panel.

**Right-click** → toggle on/off.

## Commands

| Command | Description |
|---|---|
| **SavicLabs GPU: Open Detail Panel** | Open the per-GPU breakdown panel |
| **SavicLabs GPU: Toggle Monitor** | Enable/disable the status bar monitor |
| **SavicLabs GPU: Refresh** | Force immediate GPU stats refresh |

## Settings

| Setting | Default | Description |
|---|---|---|
| `savicLabsGpu.enabled` | `true` | Enable the monitor |
| `savicLabsGpu.pollIntervalMs` | `2000` | Poll interval in ms |
| `savicLabsGpu.alertVramPercent` | `85` | VRAM % that triggers warning |
| `savicLabsGpu.alertTempCelsius` | `85` | Temp °C that triggers warning |
| `savicLabsGpu.statusBarFormat` | `GPU ${name} · ${vramUsed}/${vramTotal} · ${temp}°C` | Status bar format string |
| `savicLabsGpu.showUtilization` | `false` | Show GPU util % in status bar |

### Status Bar Variables

| Variable | Example |
|---|---|
| `${name}` | RTX 3060 |
| `${vramUsed}` | 8.2GB |
| `${vramTotal}` | 12GB |
| `${vramPercent}` | 68% |
| `${temp}` | 52 |
| `${util}` | 45 |

## Extension API

Other extensions can query GPU state:

```typescript
const gpu = vscode.extensions.getExtension('SavicLabs.savic-labs-gpu');
const api = await gpu?.activate();
api.getGpuStats();           // GpuStats[]
api.getAvailableVram();      // MiB free across all GPUs
api.canFitModel(20000);      // Can a 20GB model fit?
```

## Requirements

- VS Code `>= 1.90.0`
- One of: `nvidia-smi`, `rocm-smi`, macOS with Apple Silicon

---

**[saviclabs.com](https://saviclabs.com)** — AI tools that just work.

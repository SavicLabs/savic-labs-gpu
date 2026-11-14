# SavicLabs GPU Monitor

GPU memory, temperature, and utilisation in the VS Code status bar, with a detail panel.

The extension reads statistics from the vendor's own tooling and shows them where you
are already working. It polls on a self-rescheduling timer, so a slow query never overlaps
the next one and the extension does not keep running work in the background when it is
disabled.

## Requirements

- VS Code 1.95.0 or newer
- One of the supported GPU tools below, on the PATH

## Supported hardware

| Vendor | Platform | Source | Metrics available |
| --- | --- | --- | --- |
| NVIDIA | Linux, Windows | `nvidia-smi` | Memory, utilisation, temperature, fan, power, per-process usage, driver version |
| NVIDIA | Linux | `/proc/driver/nvidia/gpus` *(fallback)* | Model name and total memory only, when `nvidia-smi` cannot reach the driver |
| AMD | Linux | `rocm-smi` | Memory, utilisation, temperature |
| AMD | Windows | WMI + performance counters | Memory, utilisation |
| Intel | Linux | `intel_gpu_top` | Utilisation and per-process usage |
| Intel | Windows | WMI + performance counters | Memory, utilisation |
| Apple Silicon | macOS | `system_profiler`, `powermetrics` | Chip name, memory total |

If no supported tool is present the status bar shows **No GPU** and nothing else runs.

## Known limitations

These are properties of the underlying tools, not of the extension. They are stated here
so the numbers are not over-read.

- **Intel utilisation is the Render/3D engine only.** `intel_gpu_top` reports one busy
  percentage per engine, and this extension shows the Render/3D figure. It is not a
  whole-GPU utilisation number, and it will not reflect load that sits entirely on the
  Video or Blitter engines.
- **Intel memory is unavailable.** `intel_gpu_top` does not report memory use, and
  integrated Intel GPUs share system RAM. The extension reports nothing rather than
  estimating; VRAM fields read as zero.
- **Intel requires root.** `intel_gpu_top` needs elevated privileges on most
  distributions. Without them the collector returns no devices.
- **Intel multi-GPU is not supported.** The Linux collector reads a single sample and
  reports it as one device. Machines with more than one Intel GPU will see only one.
- **Windows memory totals can be wrong above 4 GB.** `Win32_VideoController.AdapterRAM`
  is a 32-bit field that overflows beyond 4 GiB. NVIDIA is read through `nvidia-smi`
  instead, so this affects AMD and Intel on Windows.
- **Windows reports no temperature, fan, or power.** These are not exposed by the
  performance counters used here.
- **AMD device names are generic.** `rocm-smi` output used here does not carry the
  marketing name, so devices are labelled `AMD GPU 0`, `AMD GPU 1`, and so on.
- **Apple Silicon needs root for utilisation and memory in use.** `powermetrics`
  requires sudo; without it the extension reports the chip name and total memory only.
- **Memory totals are reported in MiB by the vendor tools.** Values are shown as
  reported, not recalculated.

## Installation

Install **SavicLabs GPU Monitor** from the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=SavicLabs.savic-labs-gpu).

## Commands

| Command | Purpose |
| --- | --- |
| **SavicLabs GPU: Toggle Monitoring** | Enable or disable polling and the status bar item |
| **SavicLabs GPU: Cycle GPU** | Switch the status bar between devices when more than one is present |
| **SavicLabs GPU: Open Detail Panel** | Open the history and per-process panel |
| **SavicLabs GPU: Refresh** | Run a poll immediately |

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `savicLabsGpu.enabled` | `true` | Start polling on activation |
| `savicLabsGpu.pollIntervalMs` | `2000` | Poll interval, clamped to 500–60000 ms |
| `savicLabsGpu.alertVramPercent` | `85` | Warn when memory use reaches this percentage |
| `savicLabsGpu.alertTempCelsius` | `85` | Warn when temperature reaches this value |
| `savicLabsGpu.statusBarFormat` | see below | Template for the status bar text |
| `savicLabsGpu.showUtilization` | `false` | Append utilisation to the status bar text |

`statusBarFormat` supports `${name}`, `${vramUsed}`, `${vramTotal}`, `${vramPercent}`,
`${temp}`, and `${util}`.

Alerts fire once when a threshold is crossed and reset when the value falls clearly below
it, so a GPU sitting at the threshold does not produce repeated warnings.

## Development

```bash
npm ci
npm run compile      # build to out/
npm run typecheck    # tsc --noEmit
npm run lint         # oxlint
npm test             # compile, then run the parser tests
npm run package      # produce a .vsix
```

The tests exercise the vendor parsers against recorded command output, covering multiple
cards, malformed and missing fields, and the Intel engine-vs-device distinction. They do
not require GPU hardware.

## License

MIT — see [LICENSE](LICENSE).

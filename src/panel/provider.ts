/** Detail panel — WebView showing per-GPU breakdown with VRAM bar, temp, processes, history. */
import * as vscode from 'vscode';
import type { GpuStats } from '../gpu/types';

export class GpuDetailPanel {
  private static current: GpuDetailPanel | undefined;
  private panel: vscode.WebviewPanel;
  private history: Map<number, { time: number; vram: number }[]> = new Map();

  private constructor(_context: vscode.ExtensionContext) {
    this.panel = vscode.window.createWebviewPanel(
      'savicLabsGpu',
      'SavicLabs GPU Monitor',
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      GpuDetailPanel.current = undefined;
    });

    this.panel.webview.html = getPanelHtml();
  }

  static createOrShow(context: vscode.ExtensionContext): GpuDetailPanel {
    if (GpuDetailPanel.current) {
      GpuDetailPanel.current.panel.reveal(vscode.ViewColumn.Two);
      return GpuDetailPanel.current;
    }
    GpuDetailPanel.current = new GpuDetailPanel(context);
    return GpuDetailPanel.current;
  }

  update(statsList: GpuStats[]): void {
    // Track which GPU indices exist so we can clean up stale history
    const activeIndices = new Set(statsList.map((s) => s.index));

    // Clean up history for GPUs that no longer exist
    for (const idx of this.history.keys()) {
      if (!activeIndices.has(idx)) this.history.delete(idx);
    }

    // Update history for active GPUs
    for (const stats of statsList) {
      let h = this.history.get(stats.index);
      if (!h) {
        h = [];
        this.history.set(stats.index, h);
      }
      h.push({ time: Date.now(), vram: stats.vramUsedMiB });
      // Keep last 5 minutes
      const cutoff = Date.now() - 5 * 60 * 1000;
      while (h.length > 0 && h[0].time < cutoff) h.shift();
    }

    const json = JSON.stringify({
      stats: statsList,
      history: [...this.history.entries()].map(([idx, h]) => ({
        index: idx,
        points: h.map((p) => ({ t: p.time, v: p.vram })),
      })),
    });

    this.panel.webview.postMessage({ type: 'update', data: json });
  }

  dispose(): void {
    this.panel.dispose();
  }
}

function getPanelHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<title>SavicLabs GPU Monitor</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { font-size: 13px; }
  body {
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    padding: 20px 24px;
  }

  /* ── Header ── */
  .header { display: flex; align-items: center; margin-bottom: 28px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .header-icon {
    width: 40px; height: 40px; border-radius: 8px;
    background: var(--vscode-focusBorder, #007acc);
    display: flex; align-items: center; justify-content: center;
  }
  .header-title { font-size: 1.3rem; font-weight: 700; }

  /* ── Summary bar ── */
  .summary {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px; margin-bottom: 24px;
  }
  .summary-item {
    background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-widget-border);
    border-radius: 6px; padding: 12px 14px;
  }
  .summary-val { font-size: 1.2rem; font-weight: 700; }
  .summary-label { font-size: 0.72rem; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.04em; }

  /* ── GPU Cards Grid ── */
  .cards-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    gap: 16px; margin-bottom: 24px;
  }

  /* ── Card ── */
  .card {
    background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-widget-border);
    border-radius: 8px; padding: 18px;
  }
  .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .card-name { font-size: 1rem; font-weight: 700; }
  .card-index {
    font-size: 0.7rem; padding: 2px 7px; border-radius: 3px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-weight: 600;
  }

  /* ── VRAM Bar ── */
  .vram-section { margin-bottom: 16px; }
  .vram-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
  .vram-label { font-size: 0.72rem; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .vram-value { font-size: 0.82rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .vram-bar-outer {
    background: var(--vscode-input-background); border-radius: 4px;
    height: 8px; overflow: hidden;
  }
  .vram-bar-inner {
    height: 100%; border-radius: 4px; transition: width 0.6s ease;
  }

  /* ── Stats Grid ── */
  .stats-grid {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 8px; margin-bottom: 14px;
  }
  .stat-tile {
    background: var(--vscode-editor-background); border-radius: 5px; padding: 10px 8px;
    text-align: center;
  }
  .stat-num { font-size: 1.15rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat-unit { font-size: 0.68rem; font-weight: 500; }
  .stat-tag { font-size: 0.62rem; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 1px; }

  /* ── Processes ── */
  .procs-section { margin-top: 2px; }
  .procs-header {
    display: flex; align-items: center; gap: 5px; margin-bottom: 6px;
    font-size: 0.72rem; color: var(--vscode-descriptionForeground); text-transform: uppercase;
    letter-spacing: 0.05em; font-weight: 600;
  }
  .proc-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 5px 8px; margin-bottom: 2px; border-radius: 4px;
    background: var(--vscode-list-hoverBackground); font-size: 0.8rem;
  }
  .proc-left { display: flex; align-items: center; gap: 7px; }
  .proc-dot { width: 6px; height: 6px; border-radius: 50%; }
  .proc-name { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .proc-pid { color: var(--vscode-descriptionForeground); font-size: 0.7rem; font-variant-numeric: tabular-nums; }
  .proc-vram { color: var(--vscode-descriptionForeground); font-weight: 600; font-variant-numeric: tabular-nums; }
  .no-procs { color: var(--vscode-descriptionForeground); font-size: 0.76rem; font-style: italic; padding: 2px 0; }

  /* ── Chart ── */
  .chart-wrap { margin-top: 12px; }
  .chart-label { font-size: 0.68rem; color: var(--vscode-editor-foreground); opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
  canvas { width: 100%; height: 100px; border-radius: 4px; }

  /* ── Footer ── */
  .footer {
    text-align: center; padding: 16px 0 4px; font-size: 0.78rem; color: var(--vscode-descriptionForeground);
    border-top: 1px solid var(--vscode-widget-border);
  }
  .footer a { color: var(--vscode-textLink-foreground); text-decoration: none; }
</style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="header-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="5" width="20" height="13" rx="2.5" stroke="white" stroke-width="1.5" fill="none"/>
          <rect x="5" y="9" width="5" height="5" rx="1" fill="white" opacity="0.9"/>
          <rect x="13" y="9" width="5" height="2" rx="0.8" fill="white" opacity="0.5"/>
          <rect x="13" y="12" width="3" height="2" rx="0.8" fill="white" opacity="0.5"/>
          <line x1="6" y1="3" x2="8" y2="5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="10" y1="3" x2="10" y2="5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="14" y1="3" x2="14" y2="5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="18" y1="3" x2="18" y2="5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          <rect x="3" y="19" width="5" height="2" rx="0.6" fill="white" opacity="0.35"/>
          <rect x="9" y="19" width="6" height="2" rx="0.6" fill="white" opacity="0.35"/>
          <rect x="16" y="19" width="5" height="2" rx="0.6" fill="white" opacity="0.35"/>
        </svg>
      </div>
      <div>
        <div class="header-title">GPU Monitor</div>
      </div>
    </div>

  </div>

  <!-- Summary Bar -->
  <div class="summary" id="summary"></div>

  <!-- GPU Cards -->
  <div class="cards-grid" id="cards"></div>

  <!-- Footer -->
  <div class="footer">
    Powered by <a href="https://saviclabs.com">SavicLabs</a> · Open Source · MIT License
  </div>

  <script>
    var vscode = acquireVsCodeApi();
    var lastData = null;

    window.addEventListener('message', function(e) {
      if (e.data.type === 'update') {
        lastData = JSON.parse(e.data.data);
        render(lastData.stats, lastData.history);
      }
    });

    function barColor(pct) {
      if (pct > 90) return 'var(--vscode-terminal-ansiRed, #f87171)';
      if (pct > 75) return 'var(--vscode-terminal-ansiYellow, #facc15)';
      if (pct > 50) return 'var(--vscode-terminal-ansiCyan, #5eead4)';
      return 'var(--vscode-terminal-ansiGreen, #4ade80)';
    }

    function tempColor(c) {
      if (c > 85) return 'var(--vscode-terminal-ansiRed, #f87171)';
      if (c > 70) return 'var(--vscode-terminal-ansiYellow, #facc15)';
      return 'var(--vscode-editor-foreground)';
    }

    function fmtVram(mib) {
      return mib >= 1024 ? (mib/1024).toFixed(1) + ' GB' : mib + ' MB';
    }

    function fmtPower(w) { return (w || 0).toFixed(0) + 'W'; }

    function fanDisplay(speed) {
      if (speed > 0) return speed + '%';
      return 'OFF';
    }
    function fanColor(speed) { return speed > 0 ? 'var(--vscode-editor-foreground)' : 'var(--vscode-descriptionForeground)'; }

    function render(stats, history) {
      if (!stats || stats.length === 0) {
        document.getElementById('cards').innerHTML = '<div style="text-align:center;padding:60px;color:var(--vscode-descriptionForeground)"><div style="font-size:1rem;color:var(--vscode-editor-foreground);margin-bottom:6px">No GPUs detected</div><div style="font-size:0.85rem">Ensure NVIDIA drivers are installed</div></div>';
        document.getElementById('summary').innerHTML = '';
        return;
      }

      // ── Summary bar ──
      var totalVram = stats.reduce(function(a,s) { return a + s.vramTotalMiB; }, 0);
      var totalUsed = stats.reduce(function(a,s) { return a + s.vramUsedMiB; }, 0);
      var avgTemp = Math.round(stats.reduce(function(a,s) { return a + s.temperatureC; }, 0) / stats.length);
      var totalPower = stats.reduce(function(a,s) { return a + (s.powerDrawW || 0); }, 0);
      document.getElementById('summary').innerHTML =
        '<div class="summary-item"><div><div class="summary-val">' + stats.length + '</div><div class="summary-label">GPUs</div></div></div>' +
        '<div class="summary-item"><div><div class="summary-val">' + fmtVram(totalUsed) + ' / ' + fmtVram(totalVram) + '</div><div class="summary-label">VRAM</div></div></div>' +
        '<div class="summary-item"><div><div class="summary-val" style="color:' + tempColor(avgTemp) + '">' + avgTemp + '°C</div><div class="summary-label">Avg Temp</div></div></div>' +
        '<div class="summary-item"><div><div class="summary-val">' + fmtPower(totalPower) + '</div><div class="summary-label">Power</div></div></div>';

      // ── Cards ──
      var cardsHtml = '';
      for (var i = 0; i < stats.length; i++) {
        var s = stats[i];
        var vramUsed = fmtVram(s.vramUsedMiB);
        var vramTotal = fmtVram(s.vramTotalMiB);
        var procs = (s.processes || []).sort(function(a,b) { return b.vramMiB - a.vramMiB; }).slice(0, 6);

        var procHtml = '';
        if (procs.length === 0) {
          procHtml = '<div class="no-procs">No GPU processes</div>';
        } else {
          procHtml = procs.map(function(p) {
            var dotColor = p.vramMiB > 2000 ? 'var(--vscode-terminal-ansiRed, #f87171)' : p.vramMiB > 500 ? 'var(--vscode-terminal-ansiYellow, #facc15)' : 'var(--vscode-terminal-ansiCyan, #5eead4)';
            return '<div class="proc-item">' +
              '<div class="proc-left"><span class="proc-dot" style="background:' + dotColor + '"></span><span class="proc-name" title="PID ' + p.pid + '">' + escHtml(p.name) + '</span><span class="proc-pid">PID ' + p.pid + '</span></div>' +
              '<span class="proc-vram">' + p.vramMiB + ' MB</span>' +
            '</div>';
          }).join('');
        }

        cardsHtml += '<div class="card">' +
          '<div class="card-header">' +
            '<div><span class="card-name">' + escHtml(s.name) + '</span><span class="card-index" style="margin-left:8px">GPU ' + s.index + '</span></div>' +
          '</div>' +
          '<div class="vram-section">' +
            '<div class="vram-header"><span class="vram-label">Video Memory</span><span class="vram-value">' + vramUsed + ' / ' + vramTotal + '</span></div>' +
            '<div class="vram-bar-outer"><div class="vram-bar-inner" style="width:' + s.vramPercent + '%;background:' + barColor(s.vramPercent) + '"></div></div>' +
          '</div>' +
          '<div class="stats-grid">' +
            '<div class="stat-tile"><div class="stat-num" style="color:' + tempColor(s.temperatureC) + '">' + s.temperatureC + '<span class="stat-unit">°C</span></div><div class="stat-tag">Temp</div></div>' +
            '<div class="stat-tile"><div class="stat-num">' + s.utilizationGpu + '<span class="stat-unit">%</span></div><div class="stat-tag">GPU</div></div>' +
            '<div class="stat-tile"><div class="stat-num">' + (s.powerDrawW || 0).toFixed(0) + '<span class="stat-unit">W</span></div><div class="stat-tag">Power</div></div>' +
            '<div class="stat-tile"><div class="stat-num" style="color:' + fanColor(s.fanSpeed) + '">' + fanDisplay(s.fanSpeed) + '</div><div class="stat-tag">Fan</div></div>' +
          '</div>' +
          '<div class="procs-section">' +
            '<div class="procs-header">Processes <span style="color:var(--vscode-descriptionForeground)">(' + procs.length + ')</span></div>' +
            procHtml +
          '</div>' +
          '<div class="chart-wrap"><div class="chart-label">VRAM History (5 min)</div><canvas id="chart' + i + '"></canvas></div>' +
        '</div>';
      }
      document.getElementById('cards').innerHTML = cardsHtml;

      // ── Charts ──
      for (var j = 0; j < (history || []).length; j++) {
        var h = history[j];
        var canvas = document.getElementById('chart' + h.index);
        if (!canvas) continue;
        var ctx = canvas.getContext('2d');
        if (!ctx) continue;

        var cssW = Math.max(canvas.offsetWidth, 300);
        var cssH = 110;
        canvas.width = cssW * 2;
        canvas.height = cssH * 2;
        ctx.scale(2, 2);

        var points = h.points || [];
        if (points.length < 2) continue;

        var vramMax = Math.max.apply(null, points.map(function(p) { return p.v; })) * 1.15 || 1024;
        var vramMin = Math.min.apply(null, points.map(function(p) { return p.v; })) * 0.85 || 0;
        var tMin = points[0].t, tMax = points[points.length - 1].t;
        var w = cssW - 20, left = 10;

        // Y axis labels — use editor foreground for readability
        var fg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-foreground').trim();
        ctx.fillStyle = fg || '#cccccc';
        var fontFamily = getComputedStyle(document.body).getPropertyValue('--vscode-font-family').trim() || '-apple-system, sans-serif';
        ctx.font = '9px ' + fontFamily;
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(vramMax) + ' MB', cssW - 4, 18);
        ctx.fillText(Math.round(vramMin) + ' MB', cssW - 4, cssH - 8);
        ctx.textAlign = 'start';

        // Use theme accent for chart; extract actual RGB from computed style
        var accentRgb = getComputedStyle(document.body).getPropertyValue('--vscode-focusBorder').trim();
        // Parse rgb(r, g, b) or #rrggbb into components
        var r = 0, g = 122, b = 204; // default blue
        var m = accentRgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
        else if (accentRgb.startsWith('#')) {
          r = parseInt(accentRgb.slice(1,3), 16); g = parseInt(accentRgb.slice(3,5), 16); b = parseInt(accentRgb.slice(5,7), 16);
        }
        var accent = 'rgb(' + r + ',' + g + ',' + b + ')';

        // Gradient fill
        var grad = ctx.createLinearGradient(0, 0, 0, cssH);
        grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.25)');
        grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0.02)');

        ctx.beginPath();
        points.forEach(function(p, k) {
          var x = left + ((p.t - tMin) / Math.max(1, tMax - tMin)) * w;
          var y = cssH - 16 - ((p.v - vramMin) / Math.max(1, vramMax - vramMin)) * (cssH - 30);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        // Close path for fill
        var lastX = left + ((points[points.length-1].t - tMin) / Math.max(1, tMax - tMin)) * w;
        var firstX = left;
        ctx.lineTo(lastX, cssH - 16);
        ctx.lineTo(firstX, cssH - 16);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        points.forEach(function(p, k) {
          var x = left + ((p.t - tMin) / Math.max(1, tMax - tMin)) * w;
          var y = cssH - 16 - ((p.v - vramMin) / Math.max(1, vramMax - vramMin)) * (cssH - 30);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Dot at end
        var last = points[points.length - 1];
        var lx = left + ((last.t - tMin) / Math.max(1, tMax - tMin)) * w;
        var ly = cssH - 16 - ((last.v - vramMin) / Math.max(1, vramMax - vramMin)) * (cssH - 30);
        ctx.beginPath();
        ctx.arc(lx, ly, 3, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
        var bgRgb = getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim() || '#1e1e1e';
        ctx.strokeStyle = bgRgb;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  </script>
</body>
</html>`;
}

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRocmOutput } = require('../out/gpu/amd.js');
const { parseIntelSample } = require('../out/gpu/intel.js');

const MIB = 1024 * 1024;

test('ROCm: every card becomes one device, in numeric order', () => {
  const stats = parseRocmOutput(
    JSON.stringify({
      card0: { 'VRAM Total Memory (B)': String(8 * 1024 * MIB), 'VRAM Used Memory (B)': String(2 * 1024 * MIB) },
      card1: { 'VRAM Total Memory (B)': String(16 * 1024 * MIB), 'VRAM Used Memory (B)': String(4 * 1024 * MIB) },
    })
  );

  assert.equal(stats.length, 2);
  assert.deepEqual(stats.map((s) => s.index), [0, 1]);
  assert.equal(stats[0].vramTotalMiB, 8 * 1024);
  assert.equal(stats[1].vramPercent, 25);
});

test('ROCm: the non-GPU "system" entry is not reported as a device', () => {
  // Regression: enumerating every value produced a phantom GPU and shifted
  // the indices of the real cards.
  const stats = parseRocmOutput(
    JSON.stringify({
      card0: { 'VRAM Total Memory (B)': String(1024 * MIB) },
      system: { 'VRAM Total Memory (B)': '0', 'Driver version': '6.0' },
    })
  );

  assert.equal(stats.length, 1);
  assert.equal(stats[0].index, 0);
});

test('ROCm: cards sort numerically, not lexically', () => {
  const build = {};
  for (const n of [10, 2, 1]) {
    build[`card${n}`] = { 'VRAM Total Memory (B)': String(1024 * MIB) };
  }
  const stats = parseRocmOutput(JSON.stringify(build));
  assert.deepEqual(stats.map((s) => s.index), [0, 1, 2]);
});

test('ROCm: a missing temperature sensor reports 0, never NaN', () => {
  const stats = parseRocmOutput(
    JSON.stringify({ card0: { 'VRAM Total Memory (B)': String(1024 * MIB) } })
  );
  assert.equal(stats[0].temperatureC, 0);
  assert.equal(stats[0].utilizationGpu, 0);
  assert.ok(Number.isFinite(stats[0].vramPercent));
});

test('ROCm: zero total memory does not divide by zero', () => {
  const stats = parseRocmOutput(JSON.stringify({ card0: {} }));
  assert.equal(stats[0].vramTotalMiB, 0);
  assert.equal(stats[0].vramPercent, 0);
});

test('Intel: an array of samples yields one device, not one per engine', () => {
  // Regression: intel_gpu_top -J emits an array; treating it as an object made
  // every Intel GPU on Linux report zero stats.
  const stats = parseIntelSample(
    JSON.stringify([
      {
        engines: {
          'Render/3D': { busy: 42.4 },
          Blitter: { busy: 10 },
          Video: { busy: 5 },
        },
        clients: [{ pid: 1234, name: 'chrome', engine: 'Render/3D', memory: 64 * MIB }],
      },
    ])
  );

  assert.ok(stats);
  assert.equal(stats.index, 0);
  assert.equal(stats.utilizationGpu, 42);
  assert.equal(stats.processes.length, 1);
  assert.equal(stats.processes[0].name, 'chrome');
  assert.equal(stats.processes[0].vramMiB, 64);
});

test('Intel: utilisation is the Render engine, never the sum of engines', () => {
  const stats = parseIntelSample(
    JSON.stringify({
      engines: { 'Render/3D': { busy: 60 }, Blitter: { busy: 40 }, Video: { busy: 30 } },
    })
  );
  // Summing would give 130; the headline figure must be one engine's share.
  assert.equal(stats.utilizationGpu, 60);
});

test('Intel: falls back to the busiest engine when Render is absent', () => {
  const stats = parseIntelSample(
    JSON.stringify({ engines: { Blitter: { busy: 12 }, Video: { busy: 37 } } })
  );
  assert.equal(stats.utilizationGpu, 37);
});

test('Intel: memory is not invented, because intel_gpu_top does not report it', () => {
  const stats = parseIntelSample(JSON.stringify({ engines: { 'Render/3D': { busy: 5 } } }));
  assert.equal(stats.vramUsedMiB, 0);
  assert.equal(stats.vramTotalMiB, 0);
  assert.equal(stats.vramPercent, 0);
});

test('Intel: an empty sample object still produces a usable device', () => {
  const stats = parseIntelSample(JSON.stringify({}));
  assert.ok(stats);
  assert.equal(stats.utilizationGpu, 0);
  assert.deepEqual(stats.processes, []);
});

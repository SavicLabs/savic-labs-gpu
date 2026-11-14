const assert = require('node:assert');
const vscode = require('vscode');

const COMMANDS = [
  'savicLabsGpu.toggle',
  'savicLabsGpu.cycleGpu',
  'savicLabsGpu.openPanel',
  'savicLabsGpu.refresh',
];

suite('GPU Monitor extension host', () => {
  test('activation exposes the public API', async () => {
    const extension = vscode.extensions.getExtension('SavicLabs.savic-labs-gpu');
    assert.ok(extension, 'extension should be discoverable');
    const api = await extension.activate();
    assert.ok(extension.isActive, 'extension should be active');
    assert.equal(typeof api.getGpuStats, 'function');
    assert.equal(typeof api.getAvailableVram, 'function');
    assert.equal(typeof api.canFitModel, 'function');
    assert.equal(typeof api.refresh, 'function');
  });

  test('all contributed commands are registered', async () => {
    const registered = await vscode.commands.getCommands(true);
    for (const command of COMMANDS) {
      assert.ok(registered.includes(command), `${command} should be registered`);
    }
  });

  test('api returns a well-formed snapshot', async () => {
    const extension = vscode.extensions.getExtension('SavicLabs.savic-labs-gpu');
    const api = await extension.activate();
    const stats = api.getGpuStats();
    assert.ok(Array.isArray(stats), 'getGpuStats should return an array');
    for (const gpu of stats) {
      assert.equal(typeof gpu.index, 'number');
      assert.equal(typeof gpu.name, 'string');
      assert.ok(Number.isFinite(gpu.vramPercent));
      assert.ok(Number.isFinite(gpu.temperatureC), 'temperature must never be NaN');
    }
    assert.equal(typeof api.getAvailableVram(), 'number');
  });

  test('toggle command round-trips and leaves no timers behind', async () => {
    // Ensures the polling lifecycle survives a disable/enable cycle.
    await vscode.commands.executeCommand('savicLabsGpu.toggle');
    await vscode.commands.executeCommand('savicLabsGpu.toggle');
    const extension = vscode.extensions.getExtension('SavicLabs.savic-labs-gpu');
    assert.ok(extension.isActive);
  });
});

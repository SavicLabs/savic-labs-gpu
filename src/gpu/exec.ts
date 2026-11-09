/** Shared async exec helper — non-blocking shell command execution. */
import { exec } from 'node:child_process';

export function execAsync(cmd: string, timeoutMs: number = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

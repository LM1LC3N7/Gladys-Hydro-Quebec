// -----------------------------------------------------------------------------
// Node <-> Python bridge process management.
//
// The Hydro-Québec logic lives entirely in bridge/hq_bridge.py, a thin
// wrapper around the community-maintained `hydroqc` Python library (see that
// file's docstring). This module owns spawning that process, keeping it
// alive across the integration's lifetime, and speaking its line-delimited
// JSON protocol on stdin/stdout: one `{"id", "cmd", ...}` request per line
// in, one `{"id", "ok", "result"|"error"}` response per line out.
// -----------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const DEFAULT_TIMEOUT_MS = 60_000;

export class PythonBridge {
  constructor({ logger, scriptPath, pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python3' }) {
    this.logger = logger;
    this.scriptPath = scriptPath;
    this.pythonExecutable = pythonExecutable;
    this.process = null;
    this.pending = new Map(); // request id -> { resolve, reject }
    this.nextId = 1;
  }

  start() {
    if (this.process) return;
    this.logger.info(`Starting Hydro-Québec bridge: ${this.pythonExecutable} ${this.scriptPath}`);
    const child = spawn(this.pythonExecutable, [this.scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.process = child;

    createInterface({ input: child.stdout }).on('line', (line) => this._handleLine(line));

    createInterface({ input: child.stderr }).on('line', (line) => {
      if (line.trim()) this.logger.debug(`[bridge] ${line}`);
    });

    child.on('error', (err) => {
      this.logger.error('Failed to start the Hydro-Québec bridge process', err);
    });

    child.on('exit', (code, signal) => {
      this.logger.warn(`Hydro-Québec bridge process exited (code=${code}, signal=${signal})`);
      const error = new Error(`Hydro-Québec bridge process exited (code=${code}, signal=${signal})`);
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
      if (this.process === child) this.process = null;
    });
  }

  _handleLine(line) {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.logger.warn(`Non-JSON line from the Hydro-Québec bridge: ${line}`);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error ?? 'Unknown Hydro-Québec bridge error'));
  }

  /** Send one request and resolve with its `result`, or reject with its `error`. */
  async call(cmd, params = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.start();
    if (!this.process) throw new Error('Hydro-Québec bridge process is not running');

    const id = this.nextId++;
    const payload = `${JSON.stringify({ id, cmd, ...params })}\n`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Bridge call "${cmd}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.process.stdin.write(payload, (err) => {
        if (err) {
          this.pending.delete(id);
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

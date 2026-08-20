// -----------------------------------------------------------------------------
// Test fixture standing in for bridge/hq_bridge.py: implements the exact same
// line-delimited JSON protocol (see src/hydroquebec/pythonBridge.js) without
// needing a real Python + hydroqc install, so PythonBridge's request/response
// correlation can be tested in plain Node.
// -----------------------------------------------------------------------------

import { createInterface } from 'node:readline';

createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  if (request.cmd === 'boom') {
    process.stdout.write(`${JSON.stringify({ id: request.id, ok: false, error: 'boom failed' })}\n`);
    return;
  }
  if (request.cmd === 'exit') {
    process.exit(1);
  }
  if (request.cmd === 'slow') {
    setTimeout(() => {
      process.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result: 'late' })}\n`);
    }, 200);
    return;
  }
  process.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result: { echo: request } })}\n`);
});

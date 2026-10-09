// -----------------------------------------------------------------------------
// Test fixture standing in for bridge/hq_bridge.py with its STATEFUL behavior:
// like the real bridge, `poll` only knows the contracts a previous `discover`
// call cached in THIS process, so a freshly (re)started process rejects every
// poll with "Unknown contract ... call discover first" until discovery runs.
// -----------------------------------------------------------------------------

import { createInterface } from 'node:readline';

const CONTRACTS = [
  {
    applicant_id: 'app1',
    customer_id: 'cust1',
    customer_names: ['Test'],
    account_id: 'acc1',
    contract_id: '0123456789',
    rate: 'D',
    rate_option: '',
    address: '1 rue Test',
  },
];

const known = new Set();

function reply(id, ok, payload) {
  process.stdout.write(`${JSON.stringify(ok ? { id, ok, result: payload } : { id, ok, error: payload })}\n`);
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  if (request.cmd === 'discover') {
    CONTRACTS.forEach((c) => known.add(c.contract_id));
    reply(request.id, true, CONTRACTS);
  } else if (request.cmd === 'poll') {
    if (!known.has(request.contract_id)) {
      reply(request.id, false, `Unknown contract ${request.contract_id}: call discover first`);
    } else {
      reply(request.id, true, { daily_consumption_kwh: 42 });
    }
  } else {
    reply(request.id, false, `Unknown command '${request.cmd}'`);
  }
});

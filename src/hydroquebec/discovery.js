// -----------------------------------------------------------------------------
// Small pure helpers over a contract descriptor (see session.js), used by the
// device blueprint to decide which extra features to expose. Actual contract
// discovery happens in the Python bridge (bridge/hq_bridge.py, `discover`
// command) via hydroqc's own WebUser/Customer/Account/Contract classes.
// -----------------------------------------------------------------------------

/** Is this contract enrolled in the Winter Credit dynamic rate option? */
export function isCpcContract(contract) {
  return contract.rate === 'D' && contract.rateOption === 'CPC';
}

/** Is this contract billed under the Flex D dynamic rate? */
export function isDpcContract(contract) {
  return contract.rate === 'DPC';
}

// -----------------------------------------------------------------------------
// PKCE (RFC 7636) helpers, and a tiny JWT payload decoder for the id_token.
// Node's built-in `crypto` module is enough, no dependency needed.
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Generate a PKCE (S256) verifier/challenge pair. */
export function generatePkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/** Decode the (unverified) payload of a JWT. We only read claims Hydro-Québec itself issued us. */
export function decodeJwtPayload(token) {
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) return null;
  const padded = payloadSegment.padEnd(payloadSegment.length + ((4 - (payloadSegment.length % 4)) % 4), '=');
  const json = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json);
}

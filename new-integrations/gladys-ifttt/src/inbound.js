// -----------------------------------------------------------------------------
// An inbound call relayed by Gladys Plus (the IFTTT "Make a web request"
// action, or anything else able to send an HTTP request) turned into the
// flat data of the `event_received` scene trigger. Pure: no I/O.
//
// Accepted shapes, in order of precedence:
//   - a JSON body: { "event": "...", "value1": ..., "value2": ..., "value3": ...,
//     "secret": "..." } — every other key is kept in `payload`;
//   - a form body (application/x-www-form-urlencoded) with the same keys;
//   - the query string (?event=...&value1=...), for a GET.
// -----------------------------------------------------------------------------

import { EVENT_NAME, MAX_VALUE_LENGTH } from './constants.js';

const RESERVED = new Set(['event', 'value1', 'value2', 'value3', 'secret']);

function clip(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_VALUE_LENGTH ? text.slice(0, MAX_VALUE_LENGTH) : text;
}

/** The fields carried by the request, whatever its encoding. */
export function parseRequest({ body, contentType, query } = {}) {
  const fields = { ...(query ?? {}) };
  const type = String(contentType ?? '').toLowerCase();
  const text = typeof body === 'string' ? body.trim() : '';
  if (text) {
    if (type.includes('json') || text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(fields, parsed);
        }
      } catch {
        // Not JSON after all: ignored, the query may still carry the event.
      }
    } else if (type.includes('x-www-form-urlencoded') || /^[\w%.+-]+=/.test(text)) {
      for (const [key, value] of new URLSearchParams(text)) {
        fields[key] = value;
      }
    } else {
      // A plain text body is the first value of the event.
      fields.value1 ??= text;
    }
  }
  return fields;
}

/**
 * The scene event of a request, or a rejection:
 *   { ok: true, data }                  -> publish `data`
 *   { ok: false, reason }               -> ignore (and log) the request
 */
export function inboundEvent(request, { secret = '' } = {}) {
  const fields = parseRequest(request);
  if (secret) {
    const given = String(fields.secret ?? request?.query?.secret ?? '');
    if (given !== secret) {
      return { ok: false, reason: 'bad_secret' };
    }
  }
  const event = String(fields.event ?? '').trim();
  if (!EVENT_NAME.test(event)) {
    return { ok: false, reason: 'no_event' };
  }
  const extra = Object.fromEntries(Object.entries(fields).filter(([k]) => !RESERVED.has(k)));
  return {
    ok: true,
    data: {
      event,
      value1: clip(fields.value1),
      value2: clip(fields.value2),
      value3: clip(fields.value3),
      payload: Object.keys(extra).length > 0 ? clip(extra) : null,
    },
  };
}

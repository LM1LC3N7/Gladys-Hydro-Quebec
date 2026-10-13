// -----------------------------------------------------------------------------
// Livebox JSON -> plain values. Pure.
// -----------------------------------------------------------------------------

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** A LAN device of the Devices datamodel. */
export function hostOf(raw, interfaceKind) {
  const mac = String(raw.PhysAddress ?? '').toUpperCase();
  return {
    mac,
    key: raw.Key ?? mac,
    name: raw.Name || raw.DeviceType || mac,
    type: raw.DeviceType ?? null,
    ip: raw.IPAddress ?? null,
    active: raw.Active === true,
    interface: raw.InterfaceName ?? null,
    wireless: interfaceKind === 'wifi' || /^wl|^wlan|^eth4|^eth5/i.test(raw.InterfaceName ?? ''),
    lastConnection: raw.LastConnection ?? null,
    lastChanged: raw.LastChanged ?? null,
    signal: num(raw.SignalStrength),
    tags: String(raw.Tags ?? ''),
  };
}

/** Every host of a Devices answer { wifi: [], eth: [] }, deduplicated by MAC. */
export function hostsOf(answer = {}) {
  const hosts = new Map();
  for (const kind of ['wifi', 'eth']) {
    for (const raw of answer[kind] ?? []) {
      const host = hostOf(raw, kind);
      if (host.mac && /^[0-9A-F:]{17}$/.test(host.mac)) {
        hosts.set(host.mac, { ...(hosts.get(host.mac) ?? {}), ...host });
      }
    }
  }
  return [...hosts.values()];
}

/** The internet link, from NMC getWANStatus. */
export function wanOf(raw = {}) {
  const connected = raw.ConnectionState === 'Connected' || raw.ConnectionState === 'Bound';
  return {
    connected,
    linkState: raw.LinkState ?? null,
    linkType: raw.LinkType ? String(raw.LinkType).toLowerCase() : null,
    protocol: raw.Protocol ?? null,
    ip: raw.IPAddress ?? null,
    ipv6: raw.IPv6Address ?? null,
    gateway: raw.RemoteGateway ?? null,
    lastError: raw.LastConnectionError ?? null,
  };
}

/** The box itself, from DeviceInfo get. */
export function infoOf(raw = {}) {
  return {
    model: raw.ProductClass ?? raw.ModelName ?? null,
    serial: raw.SerialNumber ?? null,
    software: raw.SoftwareVersion ?? null,
    uptimeSeconds: num(raw.UpTime),
    externalIp: raw.ExternalIPAddress ?? null,
    manufacturer: raw.Manufacturer ?? null,
  };
}

/** The xDSL line, from NeMo.Intf.data getMIBs (rates in kbps). */
export function lineOf(raw = {}) {
  const down = num(raw.DownstreamCurrRate);
  const up = num(raw.UpstreamCurrRate);
  return {
    available: down !== null || up !== null,
    downMbps: down === null ? null : Math.round(down / 100) / 10,
    upMbps: up === null ? null : Math.round(up / 100) / 10,
    downAttenuation: num(raw.DownstreamLineAttenuation),
    noiseMargin: num(raw.DownstreamNoiseMargin),
  };
}

/** The calls of the log, newest first. */
export function callsOf(list = []) {
  return list
    .map((raw) => ({
      id: String(raw.callId ?? `${raw.remoteNumber}@${raw.startTime}`),
      number: raw.remoteNumber ?? '',
      name: raw.remoteName ?? '',
      type: String(raw.callType ?? '').toLowerCase(), // missed | received | dialed | ...
      startedAt: raw.startTime ? new Date(raw.startTime).toISOString() : null,
      duration: num(raw.duration),
    }))
    .filter((c) => c.startedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function missedCalls(calls) {
  return calls.filter((c) => c.type === 'missed');
}

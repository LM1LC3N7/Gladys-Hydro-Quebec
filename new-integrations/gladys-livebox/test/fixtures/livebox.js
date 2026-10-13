// Livebox answers shaped after the sysbus datamodel (Livebox 5, anonymized).
export const devices = ({ phoneActive = true, laptopActive = true } = {}) => ({
  wifi: [
    {
      Key: 'AA:BB:CC:DD:EE:01',
      Name: 'Phone Jane',
      DeviceType: 'Mobile',
      Active: phoneActive,
      IPAddress: '192.168.1.20',
      PhysAddress: 'AA:BB:CC:DD:EE:01',
      InterfaceName: 'wl0',
      LastConnection: '2026-10-13T12:00:00Z',
      SignalStrength: -55,
      Tags: 'lan edev mac physical wifi ipv4 ipv6 dhcp',
    },
    {
      Key: 'AA:BB:CC:DD:EE:02',
      Name: 'Laptop',
      DeviceType: 'Computer',
      Active: laptopActive,
      IPAddress: '192.168.1.21',
      PhysAddress: 'aa:bb:cc:dd:ee:02',
      InterfaceName: 'eth4',
      Tags: 'lan edev mac physical wifi',
    },
  ],
  eth: [
    {
      Key: 'AA:BB:CC:DD:EE:03',
      Name: 'NAS',
      DeviceType: 'NAS',
      Active: true,
      IPAddress: '192.168.1.30',
      PhysAddress: 'AA:BB:CC:DD:EE:03',
      InterfaceName: 'eth1',
      Tags: 'lan edev mac physical eth',
    },
  ],
});

export const wanStatus = ({ connected = true } = {}) => ({
  WanState: connected ? 'up' : 'down',
  LinkType: 'dsl',
  LinkState: connected ? 'up' : 'down',
  MACAddress: '00:11:22:33:44:55',
  Protocol: 'ppp',
  ConnectionState: connected ? 'Connected' : 'Disconnected',
  LastConnectionError: connected ? 'None' : 'ERROR_NO_CARRIER',
  IPAddress: connected ? '82.1.2.3' : '',
  RemoteGateway: '82.1.2.1',
  DNSServers: '80.10.246.2,80.10.246.129',
  IPv6Address: '2a01:cb00::1',
});

export const deviceInfo = {
  Manufacturer: 'Sagemcom',
  ProductClass: 'Livebox 5',
  SerialNumber: 'LK12345678',
  SoftwareVersion: 'SR50-fr-G06.R01.C04_09',
  UpTime: 3 * 86400 + 5 * 3600,
  ExternalIPAddress: '82.1.2.3',
};

export const wifi = ({ enable = true } = {}) => ({
  Enable: enable,
  Status: enable,
  ConfigurationMode: false,
});
export const guest = ({ enable = false } = {}) => ({ Enable: enable, Status: enable });

export const dsl = {
  DownstreamCurrRate: 52340,
  UpstreamCurrRate: 12010,
  DownstreamLineAttenuation: 18.5,
  DownstreamNoiseMargin: 6.2,
};

export const calls = ({ extra = [] } = {}) => [
  {
    callId: '12',
    remoteNumber: '0611223344',
    remoteName: 'Alice',
    callType: 'received',
    startTime: '2026-10-13T09:30:00Z',
    duration: 120,
    callOrigin: 'local',
  },
  {
    callId: '13',
    remoteNumber: '0155667788',
    remoteName: '',
    callType: 'missed',
    startTime: '2026-10-13T10:15:00Z',
    duration: 0,
    callOrigin: 'local',
  },
  ...extra,
];

export const NOW = Date.parse('2026-10-13T12:00:00Z');

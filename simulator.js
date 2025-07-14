const net = require('net');

const HOST = '3.109.56.93';
const PORT = 5023;

// Sample GT06 packets (hex strings)
const packets = [
  // Login
  '78780D010391608033600100018CDD0D0A',
  // GPS (example, not real data)
  '78781F1212060B0B1C2C0C034D5B890C1E0B0C0004000100000001C6A20D0A',
  // Status (example, not real data)
  '78780A1304000100020001D90D0A',
  // Alarm (example, not real data)
  '78781F1612060B0B1C2C0C034D5B890C1E0B0C0004000100000001C6A20D0A',
  // Heartbeat
  '78780A2604000100020001E90D0A',
];

function sendPacket(hex) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.connect(PORT, HOST, () => {
      const buf = Buffer.from(hex, 'hex');
      client.write(buf);
    });
    client.on('data', data => {
      console.log('Response:', data.toString('hex'));
      client.destroy();
      resolve();
    });
    client.on('error', err => {
      console.error('Simulator error:', err);
      reject(err);
    });
  });
}

(async () => {
  for (const pkt of packets) {
    console.log('Sending:', pkt);
    await sendPacket(pkt);
  }
  console.log('All packets sent.');
})();

const net = require('net');
const fs = require('fs');
const PORT = process.env.PORT || 5023;
const LOG_FILE = 'packets.log.json';

// Helper: Parse GT06 packet type
function getPacketType(buffer) {
  if (buffer.length < 2) return 'unknown';
  // GT06: 0x78 0x78 ... 0x0D 0x0A (short), 0x79 0x79 ... 0x0D 0x0A (long)
  const type = buffer[3];
  switch (type) {
    case 0x01: return 'login';
    case 0x12: return 'gps';
    case 0x13: return 'status';
    case 0x16: return 'alarm';
    case 0x22: return 'gps'; // treat 0x22 as GPS
    case 0x26: return 'heartbeat';
    default: return 'unknown';
  }
}

// Helper: Parse GT06 packet to JSON (simplified for demo)
function parsePacket(buffer) {
  const type = getPacketType(buffer);
  let details = {};
  if (type === 'gps') {
    try {
      details = parseGpsPacket(buffer);
    } catch (e) {
      details = { error: 'Failed to parse GPS packet', message: e.message };
    }
  } else if (type === 'login') {
    try {
      details = parseLoginPacket(buffer);
    } catch (e) {
      details = { error: 'Failed to parse login packet', message: e.message };
    }
  }
  return {
    raw: buffer.toString('hex'),
    type,
    length: buffer.length,
    timestamp: new Date().toISOString(),
    ...details
  };
}

// Helper: Parse GPS packet details
function parseGpsPacket(buffer) {
  // GPS info starts at index 4 (after protocol number)
  // Date/time: 6 bytes (YY MM DD HH mm ss)
  const year = 2000 + buffer[4];
  const month = buffer[5];
  const day = buffer[6];
  const hour = buffer[7];
  const minute = buffer[8];
  const second = buffer[9];
  const datetime = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  // Latitude (4 bytes), Longitude (4 bytes)
  const latRaw = buffer.readUInt32BE(10);
  const lngRaw = buffer.readUInt32BE(14);
  const latitude = latRaw / 1800000;
  const longitude = lngRaw / 1800000;
  // Speed (1 byte)
  const speed = buffer[18];
  // Course & status (2 bytes)
  const courseStatus = buffer.readUInt16BE(19);
  return { datetime, latitude, longitude, speed, courseStatus };
}

// Helper: Parse login packet details
function parseLoginPacket(buffer) {
  // IMEI is 8 bytes BCD, starting at index 4
  let imei = '';
  for (let i = 4; i < 12; i++) {
    let b = buffer[i];
    imei += ((b >> 4) & 0x0F).toString();
    imei += (b & 0x0F).toString();
  }
  imei = imei.replace(/^0+/, ''); // Remove leading zeros
  return { imei };
}

function calcCrc16(buffer, start, end) {
  // Standard CRC-16-CCITT (0x1021, initial 0x0000)
  let crc = 0;
  for (let i = start; i < end; i++) {
    crc ^= (buffer[i] << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc;
}

function sendLoginResponse(socket, loginBuffer) {
  // Serial number is 2 bytes before CRC (length-6, length-5)
  const serialHigh = loginBuffer[loginBuffer.length - 6];
  const serialLow = loginBuffer[loginBuffer.length - 5];
  const resp = Buffer.from([0x78, 0x78, 0x05, 0x01, serialHigh, serialLow, 0x00, 0x00, 0x0D, 0x0A]);
  // CRC over 0x05 0x01 [serialHigh] [serialLow]
  const crc = calcCrc16(resp, 2, 6);
  resp[6] = (crc >> 8) & 0xFF;
  resp[7] = crc & 0xFF;
  socket.write(resp);
}

const server = net.createServer(socket => {
  socket.on('data', data => {

    console.log('hello socket');
    console.log(data);
    // Log raw packet data
    const packet = parsePacket(data);
    fs.appendFileSync(LOG_FILE, JSON.stringify(packet) + '\n');
    console.log('Received:', packet);
    // Respond to login/heartbeat if needed
    if (packet.type === 'login') {
      sendLoginResponse(socket, data);
    } else if (packet.type === 'heartbeat') {
      socket.write(Buffer.from('7878051300019D0D0A', 'hex'));
    }
  });
  socket.on('error', err => console.error('Socket error:', err));
});

server.listen(PORT, () => {
  console.log(`GT06 TCP server listening on port ${PORT}`);
});

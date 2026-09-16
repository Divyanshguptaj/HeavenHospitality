#!/usr/bin/env node
const { execSync } = require('child_process');

const PORTS = [8081, 4000];

try {
  const devices = execSync('adb devices').toString();
  const hasDevice = devices
    .split('\n')
    .slice(1)
    .some((line) => line.trim().endsWith('\tdevice'));
  if (!hasDevice) process.exit(0);

  for (const port of PORTS) {
    execSync(`adb reverse tcp:${port} tcp:${port}`, { stdio: 'ignore' });
  }
  console.log(`[adb-reverse] tunneled ports ${PORTS.join(', ')} to the connected device`);
} catch {
  // No adb on PATH, or no USB device — fine when developing over LAN/tunnel instead.
}

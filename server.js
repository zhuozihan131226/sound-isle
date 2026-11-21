import os from 'node:os';
import { createApp, initStorage } from './src/app.js';

const port = Number(process.env.PORT) || 4310;
const host = process.env.HOST || '0.0.0.0';

await initStorage();
const app = createApp();

const server = app.listen(port, host, () => {
  console.log('');
  console.log('  声屿 SOUND ISLE');
  console.log(`  本机访问  http://127.0.0.1:${port}`);
  if (host === '0.0.0.0' || host === '::') {
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter(
        (item) =>
          item &&
          item.family === 'IPv4' &&
          !item.internal &&
          !item.address.startsWith('169.254.')
      )
      .map((item) => item.address);
    for (const address of [...new Set(addresses)]) {
      console.log(`  局域网访问  http://${address}:${port}`);
    }
  }
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用，请设置 PORT 环境变量后重试。`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import { createServer } from 'node:http';
import { createApp } from '../app.js';

export async function serve(options) {
  const server = createServer(createApp({ logger: () => {}, ...options }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      const done = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await done;
    }
  };
}

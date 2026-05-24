import pg from 'pg';
import { getConfig } from '../config.js';

const config = getConfig();

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  min: config.dbPoolMin ?? 5,
  max: config.dbPoolMax ?? 20,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // console.log('executed query', { text, duration, rows: res.rowCount });
  return res;
}

export async function getClient() {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;
  
  // Set a timeout for unclosed transactions
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 30 seconds!');
    console.error(`The last executed query on this client was: ${(client as any).lastQuery}`);
  }, 30000);

  (client as any).release = () => {
    clearTimeout(timeout);
    client.query = query;
    client.release = release;
    return release.apply(client);
  };

  return client;
}

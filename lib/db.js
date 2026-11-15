import { Pool, neonConfig, types } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8
types.setTypeParser(1082, (v) => v); // date as YYYY-MM-DD string

let pool;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}

export async function q(text, params = []) {
  const r = await getPool().query(text, params);
  return r.rows;
}
export async function one(text, params = []) {
  return (await q(text, params))[0] || null;
}

// Interactive transaction: fn receives { q, one }
export async function tx(fn) {
  const client = await getPool().connect();
  const t = {
    q: async (s, p = []) => (await client.query(s, p)).rows,
    one: async (s, p = []) => (await client.query(s, p)).rows[0] || null,
  };
  try {
    await client.query('BEGIN');
    const out = await fn(t);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

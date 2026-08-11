/**
 * Postgres query worker — owns the Pool and answers sync RPC from the main thread.
 * Signals completion via SharedArrayBuffer so the main thread can Atomics.wait without
 * relying on the event loop to deliver a 'message' handler (which would deadlock).
 */
const { parentPort, workerData } = require("worker_threads");
const { Pool, types } = require("pg");

// Match SQLite's JS number returns for counts and money — node-pg otherwise
// returns INT8/NUMERIC as strings, which breaks `===` and arithmetic across the app.
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(types.builtins.INT2, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(types.builtins.INT4, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(types.builtins.FLOAT4, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(types.builtins.FLOAT8, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));

const pool = new Pool({
  connectionString: workerData.connectionString,
  max: workerData.max || 10,
  idleTimeoutMillis: 30_000,
});

/** @type {import('pg').PoolClient | null} */
let txClient = null;

/**
 * @param {import('worker_threads').MessagePort} port
 * @param {Int32Array} view
 * @param {any} payload
 */
function reply(port, view, payload) {
  port.postMessage(payload);
  Atomics.store(view, 0, 1);
  Atomics.notify(view, 0, 1);
}

parentPort.on("message", async (msg) => {
  const { id, type, port, sab } = msg;
  const view = new Int32Array(sab);
  try {
    if (type === "query") {
      const client = txClient || pool;
      const res = await client.query({ text: msg.sql, values: msg.params || [] });
      reply(port, view, { id, ok: true, rows: res.rows, rowCount: res.rowCount ?? 0 });
      return;
    }
    if (type === "begin") {
      if (txClient) throw new Error("transaction already open");
      txClient = await pool.connect();
      await txClient.query("BEGIN");
      reply(port, view, { id, ok: true });
      return;
    }
    if (type === "commit") {
      if (!txClient) throw new Error("no transaction");
      await txClient.query("COMMIT");
      txClient.release();
      txClient = null;
      reply(port, view, { id, ok: true });
      return;
    }
    if (type === "rollback") {
      if (txClient) {
        try { await txClient.query("ROLLBACK"); } catch { /* ignore */ }
        txClient.release();
        txClient = null;
      }
      reply(port, view, { id, ok: true });
      return;
    }
    if (type === "savepoint") {
      if (!txClient) throw new Error("no transaction");
      await txClient.query(`SAVEPOINT ${msg.name}`);
      reply(port, view, { id, ok: true });
      return;
    }
    if (type === "release_savepoint") {
      if (!txClient) throw new Error("no transaction");
      await txClient.query(`RELEASE SAVEPOINT ${msg.name}`);
      reply(port, view, { id, ok: true });
      return;
    }
    if (type === "rollback_savepoint") {
      if (!txClient) throw new Error("no transaction");
      await txClient.query(`ROLLBACK TO SAVEPOINT ${msg.name}`);
      reply(port, view, { id, ok: true });
      return;
    }
    if (type === "end") {
      if (txClient) {
        try { await txClient.query("ROLLBACK"); } catch { /* ignore */ }
        txClient.release();
        txClient = null;
      }
      await pool.end();
      reply(port, view, { id, ok: true });
      return;
    }
    throw new Error(`unknown type ${type}`);
  } catch (e) {
    reply(port, view, {
      id,
      ok: false,
      error: e && e.message ? e.message : String(e),
    });
  }
});

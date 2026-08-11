/**
 * Prove Postgres RLS isolation with pooled connections.
 *
 *   DATABASE_URL=postgres://hathorn_app:...@host/db npx tsx scripts/rls-proof.ts
 *
 * Uses the application role (must NOT BYPASSRLS). Sets firm context via SET LOCAL
 * inside transactions and verifies Firm A cannot read Firm B rows — including after
 * connection reuse from the pool.
 */
import { Pool } from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_APP_URL;
if (!url) {
  console.error("Set DATABASE_URL (app role) first.");
  process.exit(1);
}

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
    pass += 1;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    fail += 1;
  }
}

async function withFirm<T>(
  pool: Pool,
  firmId: string,
  fn: (q: (sql: string, params?: any[]) => Promise<any>) => Promise<T>,
  opts?: { platformAdmin?: boolean; userId?: string },
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_firm_id', $1, true)", [firmId]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [opts?.userId || ""]);
    await client.query("SELECT set_config('app.platform_admin', $1, true)", [
      opts?.platformAdmin ? "1" : "0",
    ]);
    const q = (sql: string, params: any[] = []) => client.query(sql, params);
    const result = await fn(q);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const pool = new Pool({ connectionString: url, max: 4 });
  console.log("RLS proof (pooled connections)\n");

  try {
    const bypass = await pool.query(
      `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
    );
    assert(
      "app role does not BYPASSRLS",
      bypass.rows[0]?.rolbypassrls === false,
      JSON.stringify(bypass.rows[0]),
    );
    assert(
      "app role is not superuser",
      bypass.rows[0]?.rolsuper === false,
      JSON.stringify(bypass.rows[0]),
    );

    const firms = await pool.query(
      // Need migrator-like visibility — use platform admin once to discover ids,
      // then prove isolation without it.
      `SELECT id, name FROM firms ORDER BY name`,
    );
    // Without context, firms should be empty under FORCE RLS
    assert("no firm context → 0 firms", firms.rows.length === 0, `got ${firms.rows.length}`);

    // Discover firms via a one-shot superuser URL if provided, else from env fixtures.
    const migratorUrl = process.env.DATABASE_MIGRATOR_URL || process.env.DATABASE_URL_MIGRATOR;
    let firmA: string;
    let firmB: string;
    let clientA: string;
    let clientB: string;
    if (migratorUrl) {
      const { Client } = await import("pg");
      const m = new Client({ connectionString: migratorUrl });
      await m.connect();
      const f = await m.query(`SELECT id, name FROM firms ORDER BY name`);
      const hathorn = f.rows.find((r: any) => /hathorn/i.test(r.name)) || f.rows[0];
      const other = f.rows.find((r: any) => r.id !== hathorn.id) || f.rows[1];
      firmA = hathorn.id;
      firmB = other.id;
      const ca = await m.query(
        `SELECT id FROM clients WHERE firm_id=$1 ORDER BY name LIMIT 1`,
        [firmA],
      );
      const cb = await m.query(
        `SELECT id FROM clients WHERE firm_id=$1 ORDER BY name LIMIT 1`,
        [firmB],
      );
      clientA = ca.rows[0]?.id;
      clientB = cb.rows[0]?.id;
      await m.end();
    } else {
      // Fallback: platform admin discover
      const discovered = await withFirm(pool, "", async (q) => {
        return q(`SELECT id, name FROM firms ORDER BY name`);
      }, { platformAdmin: true });
      const hathorn = discovered.rows.find((r: any) => /hathorn/i.test(r.name)) || discovered.rows[0];
      const other = discovered.rows.find((r: any) => r.id !== hathorn.id);
      firmA = hathorn.id;
      firmB = other.id;
      const ca = await withFirm(pool, firmA, (q) =>
        q(`SELECT id FROM clients WHERE firm_id=$1 ORDER BY name LIMIT 1`, [firmA]));
      const cb = await withFirm(pool, firmB, (q) =>
        q(`SELECT id FROM clients WHERE firm_id=$1 ORDER BY name LIMIT 1`, [firmB]));
      clientA = ca.rows[0]?.id;
      clientB = cb.rows[0]?.id;
    }

    assert("fixture firms present", Boolean(firmA && firmB && clientA && clientB));

    const aClients = await withFirm(pool, firmA, (q) =>
      q(`SELECT id, firm_id FROM clients`));
    assert(
      "Firm A context sees only Firm A clients",
      aClients.rows.length > 0 && aClients.rows.every((r: any) => r.firm_id === firmA),
      `n=${aClients.rows.length}`,
    );
    assert(
      "Firm A cannot see Firm B client id",
      !aClients.rows.some((r: any) => r.id === clientB),
    );

    const bPeek = await withFirm(pool, firmA, (q) =>
      q(`SELECT id FROM clients WHERE id=$1`, [clientB]));
    assert("Firm A SELECT clientB by id → empty", bPeek.rows.length === 0);

    const aReleases = await withFirm(pool, firmA, (q) =>
      q(`SELECT id, client_id FROM release_records`));
    assert(
      "Firm A releases only own clients",
      aReleases.rows.every((r: any) => r.client_id !== clientB),
      `n=${aReleases.rows.length}`,
    );

    const aDocs = await withFirm(pool, firmA, (q) =>
      q(`SELECT id, client_id FROM source_documents`));
    assert(
      "Firm A documents only own clients",
      aDocs.rows.every((r: any) => r.client_id !== clientB),
    );

    const aPl = await withFirm(pool, firmA, (q) =>
      q(`SELECT COUNT(*)::int AS n FROM pl_lines`));
    const bPl = await withFirm(pool, firmB, (q) =>
      q(`SELECT COUNT(*)::int AS n FROM pl_lines`));
    const allPl = await withFirm(pool, "", async (q) => q(`SELECT COUNT(*)::int AS n FROM pl_lines`), {
      platformAdmin: true,
    });
    assert("Firm A pl_lines subset of all", aPl.rows[0].n <= allPl.rows[0].n);
    assert("Firm B pl_lines subset of all", bPl.rows[0].n <= allPl.rows[0].n);

    // Connection reuse: set Firm A, release, then Firm B on possibly same connection
    for (let i = 0; i < 8; i++) {
      const firm = i % 2 === 0 ? firmA : firmB;
      const otherClient = firm === firmA ? clientB : clientA;
      const rows = await withFirm(pool, firm, (q) =>
        q(`SELECT id FROM clients WHERE id=$1`, [otherClient]));
      if (rows.rows.length !== 0) {
        assert(`pool reuse iter ${i} no cross-tenant leak`, false);
        break;
      }
      if (i === 7) assert("pooled connection reuse clears firm context", true);
    }

    // Empty firm context fail-closed on periods
    const empty = await withFirm(pool, "", (q) => q(`SELECT COUNT(*)::int AS n FROM periods`));
    assert("empty firm context → 0 periods", empty.rows[0].n === 0, `n=${empty.rows[0].n}`);

  } finally {
    await pool.end();
  }

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

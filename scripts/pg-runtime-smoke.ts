import { db, closeDb, dbEngine } from "../lib/db";
import { setRlsFirmId, setPlatformAdmin } from "../lib/db-context";

console.log("engine", dbEngine());
setPlatformAdmin(true);
const firms: any[] = db().prepare("SELECT id, name FROM firms ORDER BY name").all();
console.log("firms", firms.map((f) => f.name));
const hathorn = firms.find((f) => /hathorn/i.test(f.name));
if (!hathorn) throw new Error("missing hathorn firm");
setPlatformAdmin(false);
setRlsFirmId(hathorn.id);
const clients: any[] = db().prepare("SELECT name FROM clients ORDER BY name").all();
console.log("clients", clients.map((c) => c.name));
const rev: any = db().prepare(
  "SELECT COALESCE(SUM(amount),0) v FROM pl_lines WHERE category='REVENUE'",
).get();
console.log("revenue", rev.v);
closeDb();
console.log("ok");

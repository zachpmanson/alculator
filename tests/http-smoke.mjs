import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
const base = `http://127.0.0.1:${process.env.PORT}`;
for (let attempt = 0; ; attempt++) {
  try { if ((await fetch(base)).ok) break; } catch { /* server starting */ }
  if (attempt === 100) throw new Error("Standalone server did not start");
  await setTimeout(100);
}
const jsonRequest = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
assert.match(await (await fetch(base)).text(), /Find the cheapest drinks/);
assert.match(await (await fetch(`${base}/reports`)).text(), /Fixture beer/);
let response = await fetch(`${base}/api/blacklist`);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), ["blocked"]);
response = await fetch(`${base}/api/blacklist/report`);
assert.deepEqual(await response.json(), [{ id: 7, product_code: "00042" }]);
response = await fetch(`${base}/api/blacklist/report`, jsonRequest("POST", { product_code: "new-report" }));
assert.equal(response.status, 201);
assert.equal(await response.text(), "");
const reports = await (await fetch(`${base}/api/blacklist/report`)).json();
assert.deepEqual(reports.map(r => r.id), [7, 51]);
assert.equal((await fetch(`${base}/api/blacklist/report`, jsonRequest("POST", {}))).status, 400);
const resolution = { id: 51, blacklisted: true, password: "wrong" };
assert.equal((await fetch(`${base}/api/blacklist/resolve`, jsonRequest("PATCH", resolution))).status, 401);
resolution.password = process.env.REPORT_ADMIN_PASSWORD;
assert.equal((await fetch(`${base}/api/blacklist/resolve`, jsonRequest("PATCH", resolution))).status, 200);
assert.deepEqual(await (await fetch(`${base}/api/blacklist`)).json(), ["blocked", "new-report"]);
assert.equal((await fetch(`${base}/api/blacklist/resolve`, jsonRequest("PATCH", { ...resolution, id: 999 }))).status, 404);
assert.equal((await fetch(`${base}/api/blacklist`, { method: "POST" })).status, 405);
const filters = { type: "beer", pack: "bottle", includePromo: false, search: "", sortBy: "ratio", order: "asc" };
response = await fetch(`${base}/api/drinks`, jsonRequest("POST", { filterOptions: filters, pageNum: "1", pageSize: "20" }));
assert.equal(response.status, 200);
assert.equal((await response.json())[0].ratio, 3);
assert.deepEqual(await (await fetch(`${base}/api/drinks/timestamp`)).json(), { date: "2026-01-01T00:00:00Z" });
console.log("PASS: UI SSR, drinks/timestamp, report create/list/sequence, admin reject/resolve/404, blacklist and 405 over HTTP");

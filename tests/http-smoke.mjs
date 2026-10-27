import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// Reserve an ephemeral loopback port, never use the production/default listener.
const reservation = net.createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const dir = await mkdtemp(path.join(os.tmpdir(), "alculator-http-"));
const secret = "synthetic-http-only-not-a-credential";
const child = spawn("./bin/alculator", ["serve", "-db", path.join(dir, "reports.sqlite"), "-listen", `127.0.0.1:${port}`], {
  env: { ...process.env, REPORT_ADMIN_PASSWORD: secret }, stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (data) => logs += data);
child.stderr.on("data", (data) => logs += data);
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i=0; i<100; i++) {
    try { if ((await fetch(base+"/healthz")).status === 200) { ready = true; break; } } catch { /* startup */ }
    if (child.exitCode !== null) throw new Error("server exited: "+logs);
    await sleep(50);
  }
  assert(ready, "server did not become ready");
  for (const route of ["/", "/reports", "/reports?direct=true"]) {
    const res = await fetch(base+route);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    const html = await res.text();
    assert.match(html, /<div id="root">/);
    const scripts = [...html.matchAll(/src="(\/assets\/[^\"]+\.js)"/g)];
    assert(scripts.length > 0, "real built bundle required");
    for (const [,asset] of scripts) {
      const js = await fetch(base+asset);
      assert.equal(js.status, 200);
      assert.match(js.headers.get("content-type"), /javascript/);
      const text = await js.text();
      assert(text.length > 10000, "must embed real React app, not a placeholder");
      assert(!text.includes(secret));
      assert(!text.includes("REPORT_ADMIN_PASSWORD"));
      assert.match(js.headers.get("cache-control"), /immutable/);
    }
    const css = html.match(/href="(\/assets\/[^\"]+\.css)"/);
    assert(css);
    assert.equal((await fetch(base+css[1])).status, 200);
  }
  for (const route of ["/api/unknown", "/api", "/assets/missing.js", "/icons/missing.png", "/assets/", "/reports/other", "/unknown", "/.env", "/reports.sqlite"]) {
    const res = await fetch(base+route);
    assert.equal(res.status, 404, route);
    assert(!(await res.text()).includes('<div id="root">'), route+" must not receive SPA HTML");
  }
  const icon = await fetch(base+"/icons/favicon-32x32.png");
  assert.equal(icon.status, 200);
  assert.equal(Buffer.compare(Buffer.from(await icon.arrayBuffer()), await readFile("public/icons/favicon-32x32.png")), 0);
  assert.equal((await fetch(base+"/reports", {method:"HEAD"})).status, 200);
  assert.equal((await fetch(base+"/", {method:"POST"})).status, 405);
  // SQLite-only API checks avoid all catalogue/upstream reads.
  assert.deepEqual(await (await fetch(base+"/api/blacklist")).json(), []);
  const created = await fetch(base+"/api/blacklist/report", {method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({product_code:"fixture-http-001"})});
  assert.equal(created.status, 201);
  const pending = await (await fetch(base+"/api/blacklist/report")).json();
  assert.equal(pending.length, 1);
  const resolved = await fetch(base+"/api/blacklist/resolve", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:pending[0].id,blacklisted:false,password:secret})});
  assert.equal(resolved.status, 200);
  assert.deepEqual(await (await fetch(base+"/api/blacklist/report")).json(), []);
  assert.equal((await stat(path.join(dir,"reports.sqlite"))).mode & 0o777, 0o600);
  assert(!logs.includes(secret));
  console.log("PASS executable HTTP: embedded React JS/CSS/icons, / and direct /reports, health, real 404s, methods/HEAD, synthetic SQLite report/resolve, private DB mode; no feed/network reads");
} finally {
  if (child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  await rm(dir, {recursive:true,force:true});
}
assert.equal(child.exitCode, 0, logs);

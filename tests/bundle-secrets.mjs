import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const marker = "SYNTHETIC_BUILD_SECRET_MUST_NOT_APPEAR_42d7";
execFileSync("pnpm", ["build"], {
  stdio: "inherit",
  env: { ...process.env, REPORT_ADMIN_PASSWORD: marker, VITE_REPORT_ADMIN_PASSWORD: marker, VITE_PUBLIC_REPORT_ADMIN_PASSWORD: marker },
});
async function check(dir) {
  for (const item of await readdir(dir, {withFileTypes:true})) {
    const file = path.join(dir,item.name);
    if (item.isDirectory()) await check(file);
    else assert(!(await readFile(file)).includes(Buffer.from(marker)), "synthetic secret leaked: "+file);
  }
}
await check("internal/web/dist");
console.log("PASS bundle: runtime and VITE_* synthetic secret canaries absent from every generated asset");

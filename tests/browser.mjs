import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.FIXTURE_URL;
const executablePath = process.env.CHROMIUM_EXECUTABLE;
assert(base && /^http:\/\/127\.0\.0\.1:\d+$/.test(base), "requires ephemeral loopback fixture URL");
assert(executablePath, "set CHROMIUM_EXECUTABLE (or use the Nix browser devshell)");
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Intercept every non-fixture request before it hits the network. Product
  // images use a local pixel; public sites/API/real products are never contacted.
  const blocked = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(base + "/")) return route.continue();
    if (url.startsWith("https://media.danmurphys.com.au/") && route.request().resourceType() === "image") {
      return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=", "base64") });
    }
    blocked.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const waitCount = (selector, count) => page.waitForFunction(({selector,count}) => document.querySelectorAll(selector).length === count, {selector,count});
  const firstName = async (name) => page.waitForFunction((name) => document.querySelector(".card h3")?.textContent?.trim() === name, name);
  const json = async (path) => {
    const res = await context.request.get(base + path);
    assert.equal(res.status(), 200);
    return res.json();
  };

  // Deterministic race regressions: virtual timers and held loopback responses only.
  const races = await context.newPage();
  races.on("pageerror", (error) => errors.push(error.message));
  const clockTime = new Date("2026-02-01T00:00:00Z");
  await races.clock.install({ time: clockTime });
  await races.clock.pauseAt(clockTime);
  const raceCount = (count) => races.waitForFunction((count) => document.querySelectorAll(".card").length === count, count);
  const requests = [];
  let holdPage = 1;
  let held;
  let release;
  let failPage2 = false;
  await races.route(base + "/api/drinks", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const shouldFail = body.pageNum === 2 && failPage2;
    if (shouldFail) failPage2 = false;
    const response = shouldFail ? undefined : await route.fetch();
    if (body.pageNum === holdPage) {
      holdPage = 0;
      held = body;
      await new Promise((resolve) => { release = resolve; });
    }
    try {
      await route.fulfill(shouldFail ? { status: 503, body: "synthetic failure" } : { response });
    } catch { /* Obsolete request may be aborted. */ }
  });
  const waitHeld = async () => {
    while (!held) await new Promise((resolve) => setTimeout(resolve, 5));
  };
  const bottomScroll = () => races.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    window.dispatchEvent(new Event("scroll"));
  });
  const navigateReports = () => races.evaluate(() => {
    window.history.pushState({}, "", "/reports");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await races.goto(base);
  await waitHeld();
  await races.locator(".loading-spinner").waitFor();
  assert.equal(await races.getByText("No results", { exact: true }).count(), 0);
  release();
  await raceCount(20);

  // Same-tick clicks plus repeated bottom scrolls cannot cancel/skip held page 2.
  held = undefined;
  holdPage = 2;
  await races.getByRole("button", { name: "Load more" }).evaluate((button) => {
    button.click(); button.click(); button.click();
  });
  await waitHeld();
  assert.equal(await races.getByRole("button", { name: "Load more" }).isDisabled(), true);
  await bottomScroll();
  await races.clock.runFor(600);
  await bottomScroll();
  await races.clock.runFor(600);
  assert.deepEqual(requests.map((r) => r.pageNum), [1, 2]);
  release();
  await raceCount(26);
  assert.equal(await races.getByRole("button", { name: "Load more" }).count(), 1, "short page is not the end");
  await races.getByRole("button", { name: "Load more" }).click();
  await races.getByRole("button", { name: "Load more" }).waitFor({ state: "detached" });
  assert.deepEqual(requests.map((r) => r.pageNum), [1, 2, 3]);
  assert.equal(requests.every((r) => r.pageSize === 20), true);

  await races.reload();
  await raceCount(20);
  failPage2 = true;
  held = undefined;
  holdPage = 2;
  await races.getByRole("button", { name: "Load more" }).click();
  await waitHeld();
  assert.equal(await races.getByRole("button", { name: "Load more" }).isDisabled(), true);
  release();
  await races.waitForFunction(() => !document.querySelector(".load-button")?.disabled);
  assert.equal(await races.locator(".card").count(), 20);
  await races.getByRole("button", { name: "Load more" }).click();
  await raceCount(26);
  assert.deepEqual(requests.slice(-3).map((r) => r.pageNum), [1, 2, 2], "failed page retries same cursor");

  // Hold an already-decoded page-two JSON promise past a filter-generation reset.
  await races.reload();
  await raceCount(20);
  await races.evaluate(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (args[0] === "/api/drinks" && JSON.parse(args[1].body).pageNum === 2) {
        const data = await response.json();
        response.json = () => new Promise((resolve) => {
          window.releaseDecodedPage = () => resolve(data);
        });
      }
      return response;
    };
  });
  await races.getByRole("button", { name: "Load more" }).click();
  await races.waitForFunction(() => !!window.releaseDecodedPage);
  await races.locator("#drinks").selectOption("cider");
  await raceCount(1);
  await races.evaluate(() => window.releaseDecodedPage());
  // A fixture response acts as a network/event-loop barrier after the stale continuation.
  await races.evaluate(async () => { await fetch("/healthz"); });
  await raceCount(1);
  assert.equal(await races.locator(".card h3").innerText(), "Fixture cider 01");

  // Abort a genuinely held page 2 as well, then release its network response late.
  await races.reload();
  await raceCount(20);
  held = undefined;
  holdPage = 2;
  await races.getByRole("button", { name: "Load more" }).click();
  await waitHeld();
  await races.locator("#drinks").selectOption("cider");
  await raceCount(1);
  release();
  await races.evaluate(async () => { await fetch("/healthz"); });
  await raceCount(1);

  // Unmount cancels both queued scroll advancement and search; report reset wins.
  await races.reload();
  await raceCount(20);
  await bottomScroll();
  const beforeNavigation = requests.length;
  await navigateReports();
  await races.getByPlaceholder("Password").waitFor();
  await races.clock.runFor(600);
  assert.equal(requests.slice(beforeNavigation).some((r) => r.pageNum !== 1), false);
  await races.getByRole("link", { name: "Go home" }).click();
  await raceCount(20);
  await races.getByPlaceholder("Search...").fill("fixture beer 25");
  const beforeSearchNavigation = requests.length;
  await navigateReports();
  await races.getByPlaceholder("Password").waitFor();
  await races.clock.runFor(600);
  assert.equal(requests.slice(beforeSearchNavigation).some((r) => r.filterOptions.search !== ""), false);
  await races.getByRole("link", { name: "Go home" }).click();
  await raceCount(20);
  assert.equal(await races.getByPlaceholder("Search...").inputValue(), "");
  // Intervening renders do not create a second detached debounce timer.
  await races.getByPlaceholder("Search...").fill("fixture beer 25");
  await races.clock.runFor(100);
  await races.getByText("Report mistake", { exact: true }).click();
  await races.getByPlaceholder("Search...").fill("fixture cider");
  const beforeSearch = requests.length;
  await races.clock.runFor(251);
  await raceCount(1);
  assert.deepEqual(requests.slice(beforeSearch).map((r) => r.filterOptions.search), ["fixture cider"]);
  // Report failures are synthetic and do not mutate the fixture's seeded IDs.
  await races.route(base + "/api/reports", (route) => route.abort("failed"));
  await navigateReports();
  await races.getByRole("alert").waitFor();
  assert.match(await races.getByRole("alert").innerText(), /Could not load reports/);
  await races.unroute(base + "/api/reports");
  await races.reload();
  await raceCount(12);
  let resolutionCalls = 0;
  await races.route(base + "/api/blacklist/resolve", (route) => {
    resolutionCalls++;
    return route.fulfill({ status: resolutionCalls === 1 ? 200 : 503, contentType: "application/json", body: "{}" });
  });
  await races.getByRole("button", { name: "Keep", exact: true }).first().click();
  await races.getByRole("alert").waitFor();
  assert.equal(resolutionCalls, 2);
  assert.equal(await races.locator(".card").count(), 12, "partial duplicate failure retains product for retry");
  await races.unroute(base + "/api/blacklist/resolve");
  await races.clock.resume(); // Playwright's clock is shared by this browser context.
  await races.close();

  // Direct deep link, real reports fetch/raw pack cards, duplicate IDs, and
  // failed password must not remove a pending product.
  await page.goto(base + "/reports");
  await waitCount(".card", 12);
  assert.equal(await page.title(), "Pending Reports");
  await page.getByPlaceholder("Password").fill("wrong-synthetic-password");
  await page.getByRole("button", { name: "Keep", exact: true }).first().click();
  await page.getByRole("alert").waitFor();
  assert.equal((await json("/api/blacklist/report")).length, 3);
  await page.getByPlaceholder("Password").fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Keep", exact: true }).first().click();
  await waitCount(".card", 6);
  assert.equal((await json("/api/blacklist/report")).length, 1);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByText("No pending reports", {exact:true}).waitFor();
  assert.deepEqual(await json("/api/blacklist"), ["fixture-beer-02"]);

  await page.getByRole("link", { name: "Go home" }).click();
  await waitCount(".card", 20);
  assert.equal(await page.title(), "Alculator");
  await firstName("Fixture beer 01");
  await page.reload();
  await waitCount(".card", 20);
  await page.locator(".card .lock-button").first().click();
  await page.locator(".locked-drinks").waitFor();
  await page.locator(".card .lock-button").first().click();
  await waitCount(".locked-drinks", 0);
  await page.locator(".card .lock-button").first().click();
  await page.locator(".locked-drinks").waitFor();
  await page.locator("h1").click();
  await waitCount("tbody tr", 20);
  assert.equal(await page.locator(".card").count(), 0);
  await page.locator("h1").click();
  await waitCount(".card", 20);
  assert.match(await page.locator(".locked-drinks").innerText(), /Fixture beer 01/);

  await page.locator("#drinks").selectOption("cider");
  await waitCount(".card", 1);
  await firstName("Fixture cider 01");
  await page.locator("#pack").selectOption("pack");
  await page.waitForFunction(() => document.querySelector(".card")?.textContent?.includes("$6") && document.querySelector(".card")?.textContent?.includes("Units4"));
  await page.locator("summary").click();
  await page.getByLabel("Include promotions").check();
  await page.waitForFunction(() => document.querySelector(".card")?.textContent?.includes("$8"));
  await page.getByLabel("Include promotions").uncheck();
  await page.locator("#pack").selectOption("case");
  await page.waitForFunction(() => document.querySelector(".card")?.textContent?.includes("Units12"));
  await page.locator("#pack").selectOption("bottle");
  await page.locator("#drinks").selectOption("all");
  await waitCount(".card", 20);
  await page.getByPlaceholder("Search...").fill("FIXTURE BEER 25");
  await waitCount(".card", 1);
  await firstName("Fixture beer 25");
  await page.getByPlaceholder("Search...").fill("");
  await waitCount(".card", 20);
  await page.getByRole("button", { name: "Load more" }).click();
  await waitCount(".card", 26);
  // Change filters after paging: do not append stale page-two results.
  await page.locator("#sortby").selectOption("price");
  await page.locator("#order").selectOption("desc");
  await waitCount(".card", 20);
  await firstName("Fixture beer 25");
  await page.locator("#sortby").selectOption("standardDrinks");
  await page.locator("#order").selectOption("asc");
  await firstName("Fixture beer 01");
  await page.locator("#sortby").selectOption("ratio");
  await page.locator("#order").selectOption("desc");
  await firstName("Fixture beer 25");

  await page.getByText("Report mistake", {exact:true}).click();
  const reported = page.waitForResponse((r) => r.url() === base + "/api/blacklist/report" && r.request().method() === "POST");
  await page.locator(".card a").first().click();
  assert.equal((await reported).status(), 201);
  await waitCount(".card", 19);
  await page.getByRole("link", { name: "Pending reports" }).click();
  await waitCount(".card", 6);
  // Provider survived client navigation; locked drinks are retained.
  await page.getByRole("link", { name: "Go home" }).click();
  await page.locator(".locked-drinks").waitFor();
  assert.match(await page.locator(".locked-drinks").innerText(), /Fixture beer 01/);
  await page.goBack();
  await waitCount(".card", 6);
  await page.getByPlaceholder("Password").fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await page.getByText("No pending reports", {exact:true}).waitFor();
  await page.reload();
  await page.getByText("No pending reports", {exact:true}).waitFor();
  assert.deepEqual(await json("/api/blacklist/report"), []);
  assert.deepEqual(errors, [], "browser runtime errors");
  assert.deepEqual(blocked, [], "unexpected external requests (all blocked)");
  console.log("PASS browser: held/failed paging serialization and retry, stale decoded/aborted response guards, scroll/search unmount cleanup, stable debounce, initial spinner; direct /reports, duplicate reports, wrong password, keep/remove, cards/table, category/pack/promo/search/sort, paging/filter reset, locks, report creation, client/history navigation, reload; zero upstream requests/runtime errors");
} finally {
  await browser.close();
}

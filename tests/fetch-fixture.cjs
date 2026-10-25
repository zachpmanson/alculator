// Test-only preload: no GitHub network/data dependency during HTTP smoke tests.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = String(input);
  if (url.startsWith("https://raw.githubusercontent.com/pavo-etc/alculator-data/master/")) {
    return Promise.resolve(Response.json(url.endsWith("/beer.json") ? [{
      name: "Fixture beer", stockcode: "00042", standardDrinks: 2,
      prices: { bottle: 6 }, units: { pack: 6, case: 24 }, percentage: "5",
    }] : []));
  }
  if (url.startsWith("https://api.github.com/repos/")) {
    return Promise.resolve(Response.json({ commit: { commit: { author: { date: "2026-01-01T00:00:00Z" } } } }));
  }
  return originalFetch(input, options);
};

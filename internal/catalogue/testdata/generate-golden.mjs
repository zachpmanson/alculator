// Synthetic-only golden oracle: the main branch drinks handler's JS pipeline.
// Regenerate with: nix develop "path:$PWD" --command node internal/catalogue/testdata/generate-golden.mjs
import { writeFileSync } from 'node:fs';
const drink = (name, stockcode, standardDrinks, prices, units = {}) => ({ name, stockcode, standardDrinks, prices, units, percentage: '5%', extra: { retained: true } });
const feeds = {
  beer: [null,
    drink('Example A', '001', 2, { bottle: 6, promobottle: 4, pack: 20, promopack: 18, case: 30, promocase: 25 }, { pack: 4, case: 12 }),
    drink('Example B', '002', 2, { bottle: 6, promobottle: 8, pack: 10, case: 20 }, { pack: 2, case: 0 }),
    drink('Missing promo', '003', 2, { bottle: 4, pack: 9, case: 30 }, { pack: 3, case: 6 }),
    drink('Null base', '004', 1, { bottle: null, promobottle: 3 }),
    drink('Promo only', '005', 2, { promobottle: 10 }),
    drink('Zero standard', '006', 0, { bottle: 1 }),
    drink('Missing standard', '007', undefined, { bottle: 1 }),
    drink('No unit', '008', 2, { pack: 8, case: 20 }),
    drink('Zero price', '009', 2, { bottle: 0 })],
  cider: [drink('Tie cider', '010', 2, { bottle: 6 })],
  premix: [drink('Tie premix', '011', 2, { bottle: 6 })],
  spirits: [drink('Tie spirits', '012', 2, { bottle: 6 })],
  redwine: [drink('Tie red', '013', 2, { bottle: 6 })],
  whitewine: [drink('Tie white', '014', 2, { bottle: 6 })]
};
const filters = { type: 'all', pack: 'bottle', includePromo: false, search: '', sortBy: 'ratio', order: 'asc' };
const specs = [
 ['all-stable-ties', {}, '1', '20'],
 ['page-two', {}, '2', '3'],
 ['price-desc', { type: 'beer', order: 'desc', sortBy: 'price' }],
 ['promo-missing-null-max', { type: 'beer', includePromo: true }],
 ['pack-multiplication', { pack: 'pack' }],
 ['promo-pack', { pack: 'pack', includePromo: true }],
 ['case-multiplication', { pack: 'case', sortBy: 'standardDrinks', order: 'desc' }],
 ['promo-enum-quirk', { pack: 'promobottle', includePromo: true }],
 ['search-lowercase', { search: 'example' }],
 ['search-case-sensitive', { search: 'Example' }],
 ['large-page', {}, '9007199254740991', '9007199254740991']
];
const makeCases = (feeds, specs) => specs.map(([name, overrides, pageNum = 1, pageSize = 20]) => {
 const currentFilters = { ...filters, ...overrides };
 const allDrinks = currentFilters.type === 'all' ? Object.values(feeds).flat() : feeds[currentFilters.type];
 const fullPackname = currentFilters.includePromo ? 'promo' + currentFilters.pack : currentFilters.pack;
 const sortBy = currentFilters.sortBy;
 const sortFn = (a, b) => (a[sortBy] - b[sortBy]) * (currentFilters.order === 'asc' ? 1 : -1);
 const expected = allDrinks.filter(d => !!d).filter(d => !!d.standardDrinks)
  .filter(d => !!d.prices[fullPackname] || !!d.prices[currentFilters.pack])
  .filter(d => currentFilters.pack !== 'case' || !!d.units.case)
  .filter(d => currentFilters.pack !== 'pack' || !!d.units.pack)
  .map(d => ({ ...d, standardDrinks: d.standardDrinks * (currentFilters.pack === 'case' ? d.units.case : currentFilters.pack === 'pack' ? d.units.pack : 1) }))
  .map(d => ({ ...d, price: Math.max(d.prices[fullPackname], d.prices[currentFilters.pack]) }))
  .map(d => ({ ...d, ratio: d.price / d.standardDrinks }))
  .filter(d => d.name.toLocaleLowerCase().includes(currentFilters.search)).sort(sortFn)
  .slice((+pageNum - 1) * +pageSize, +pageNum * +pageSize);
 return { name, request: { filterOptions: currentFilters, pageNum, pageSize }, expected };
});
// Small mixed-NaN cases above retain their historical outputs, but their order
// is not portable: the subtraction comparator is inconsistent in that domain.
// Larger mixed fixtures assert values/JSON validity separately in Go, not V8 order.
writeFileSync(new URL('golden.json', import.meta.url), JSON.stringify({ feeds, cases: makeCases(feeds, specs) }, null, 2) + '\n');

const unicodeFeeds = {
  beer: ['ΟΣ', 'Οσ', 'ΟΣΑ', 'İ', 'I', 'ı'].map((name, i) => drink(name, `unicode-${i}`, 2, { bottle: 6 })),
  cider: [], premix: [], spirits: [], redwine: [], whitewine: []
};
const unicodeSpecs = [
  ['greek-final-sigma', { search: 'ος' }],
  ['greek-medial-sigma', { search: 'οσ' }],
  ['greek-case-sensitive', { search: 'ΟΣ' }],
  ['dotted-i-expansion', { search: 'i\u0307' }],
  ['ascii-i', { search: 'i' }],
  ['dotless-i', { search: 'ı' }],
  ['dotted-i-case-sensitive', { search: 'İ' }]
];
writeFileSync(new URL('unicode-golden.json', import.meta.url), JSON.stringify({ feeds: unicodeFeeds, cases: makeCases(unicodeFeeds, unicodeSpecs) }, null, 2) + '\n');

// Turns the round-trip measurements into the coefficients of
// cost = a * spread * n + b.

import fs from "node:fs";

const log = JSON.parse(fs.readFileSync(process.argv[2] || new URL("../parsed_json/t212-experiment.json", import.meta.url), "utf8"));

// The quoted spread at an instant, taken from the CFD twin: the real ETF streams
// only a last-traded price, so the CFD book is the only bid/ask on offer.
function quoteAt(quotes, at) {
  const q = quotes.filter((x) => x.kind === "quote" && x.at <= at).sort((a, b) => b.at - a.at)[0];
  return q || quotes.filter((x) => x.kind === "quote").sort((a, b) => a.at - b.at)[0] || null;
}

const rows = [];
for (const r of log.rounds) {
  const buyQuotes = [...r.quotes.beforeBuy, ...r.quotes.afterBuy];
  const sellQuotes = [...r.quotes.afterBuy, ...r.quotes.afterSell];

  const qBuy = quoteAt(buyQuotes, r.afterBuy.at);
  const qSell = quoteAt(sellQuotes, r.afterSell.at);

  // The exact fill price the platform booked, rather than the cent-rounded cash move.
  const buyFill = r.afterBuy.position ? r.afterBuy.position.averagePrice : null;
  const sellFill = r.credited !== null ? r.credited / r.heldQuantity : null;

  rows.push({
    n: r.n,
    rep: r.rep,
    debited: r.debited,
    credited: r.credited,
    cost: r.roundTripCost,
    costPerShare: r.roundTripCost === null ? null : r.roundTripCost / r.n,
    buyFill,
    sellFill,
    buyBid: qBuy?.bid ?? null,
    buyAsk: qBuy?.ask ?? null,
    buySpread: qBuy ? +(qBuy.ask - qBuy.bid).toFixed(4) : null,
    sellBid: qSell?.bid ?? null,
    sellAsk: qSell?.ask ?? null,
    sellSpread: qSell ? +(qSell.ask - qSell.bid).toFixed(4) : null,
  });
}

console.log("--- per round ---");
for (const r of rows) {
  console.log(
    `n=${r.n} rep=${r.rep} | debit €${r.debited} credit €${r.credited} cost €${r.cost} ` +
      `(€${r.costPerShare?.toFixed(5)}/share) | buyFill ${r.buyFill} sellFill ${r.sellFill?.toFixed(4)} | ` +
      `spread buy ${r.buySpread} sell ${r.sellSpread}`
  );
}

// Average quoted spread across the whole session, which is the "spread" the
// formula is stated in terms of.
const spreads = log.quoteStream
  .filter((q) => q.kind === "quote")
  .map((q) => q.ask - q.bid)
  .filter((s) => s > 0);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const meanSpread = mean(spreads);
const medSpread = median(spreads);

const lastPrices = log.quoteStream.filter((q) => q.kind === "last").map((q) => q.price);
const mids = log.quoteStream.filter((q) => q.kind === "quote").map((q) => (q.ask + q.bid) / 2);
const refPrice = mids.length ? mean(mids) : mean(lastPrices);

console.log(`\n--- quoted spread over the session (${spreads.length} ticks) ---`);
console.log(`mean   = ${meanSpread.toFixed(5)} EUR  (${((meanSpread / refPrice) * 10000).toFixed(2)} bp)`);
console.log(`median = ${medSpread.toFixed(5)} EUR  (${((medSpread / refPrice) * 10000).toFixed(2)} bp)`);
console.log(`min/max= ${Math.min(...spreads).toFixed(4)} / ${Math.max(...spreads).toFixed(4)}`);
console.log(`reference price = ${refPrice.toFixed(4)}`);

// Least-squares fit of cost = A*n + b, then split A into a * spread.
const pts = rows.filter((r) => r.cost !== null).map((r) => [r.n, r.cost]);
const N = pts.length;
const sx = pts.reduce((a, [x]) => a + x, 0);
const sy = pts.reduce((a, [, y]) => a + y, 0);
const sxx = pts.reduce((a, [x]) => a + x * x, 0);
const sxy = pts.reduce((a, [x, y]) => a + x * y, 0);
const A = (N * sxy - sx * sy) / (N * sxx - sx * sx);
const b = (sy - A * sx) / N;

console.log(`\n--- fit cost = A*n + b  (${N} round trips) ---`);
console.log(`A = ${A.toFixed(6)} EUR per share`);
console.log(`b = ${b.toFixed(6)} EUR`);
console.log(`\nexpressed as cost = a * spread * n + b:`);
console.log(`  a (vs mean spread ${meanSpread.toFixed(5)})   = ${(A / meanSpread).toFixed(4)}`);
console.log(`  a (vs median spread ${medSpread.toFixed(5)}) = ${(A / medSpread).toFixed(4)}`);

console.log(`\n--- predicted vs measured ---`);
for (const r of rows) {
  const pred = A * r.n + b;
  console.log(`n=${r.n} rep=${r.rep}: measured €${r.cost}  fitted €${pred.toFixed(4)}`);
}

// Group means, which is what the two-point solve actually rests on.
const byN = new Map();
for (const r of rows) {
  if (!byN.has(r.n)) byN.set(r.n, []);
  byN.get(r.n).push(r.cost);
}
console.log(`\n--- by size ---`);
for (const [n, cs] of [...byN].sort((a, b) => a[0] - b[0])) {
  console.log(
    `n=${n}: cost €${mean(cs).toFixed(4)} (all: ${cs.join(", ")}) -> €${(mean(cs) / n).toFixed(5)}/share, ` +
      `${((mean(cs) / n / refPrice) * 10000).toFixed(2)} bp of price, ` +
      `${((mean(cs) / n / meanSpread)).toFixed(3)} × spread`
  );
}

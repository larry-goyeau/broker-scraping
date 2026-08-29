// Predicts what a buy-then-immediate-sell round trip costs on Xetra, by walking
// the level-2 order book that Deutsche Boerse streams for free, and compares the
// prediction against what the same round trip actually cost on Trading212.
//
//   node trading212/t212-predict.mjs
//
// The book is exact but delayed 15 minutes, so this answers "what would this have
// cost a quarter of an hour ago", not "what will it cost now". Trading212 also
// internalises some orders instead of routing them here, in which case the price
// comes from its own quote rather than this book.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

// Defaults are the three round trips already measured, which serve as the
// validation set. Pass --isin=... --n=... to price a new one.
const arg = (name) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
};

const CASES = arg("isin")
  ? [
      {
        name: arg("name") || arg("isin"),
        isin: arg("isin"),
        n: Number(arg("n") || 1),
        measured: arg("measured") ? Number(arg("measured")) : null,
        xlm: arg("xlm") ? Number(arg("xlm")) : null,
      },
    ]
  : [
      { name: "EUNL", isin: "IE00B4L5Y983", n: 8, measured: 0.12, xlm: 2.04 },
      { name: "IUSQ", isin: "IE00B6R52259", n: 20, measured: 0.4, xlm: 3.69 },
      { name: "GC40", isin: "LU1681046931", n: 10, measured: 0.56, xlm: 6.2 },
    ];

/** Consumes `n` shares from one side of the book, cheapest level first. */
function walk(levels, n) {
  let left = n;
  let cash = 0;
  const used = [];
  for (const lvl of levels) {
    if (left <= 0) break;
    const take = Math.min(left, lvl.quantity);
    cash += take * lvl.price;
    used.push({ price: lvl.price, take });
    left -= take;
  }
  return { cash, filled: n - left, used, exhausted: left > 0 };
}

async function bookFor(browser, isin) {
  const page = await browser.newPage();
  const client = await page.createCDPSession();
  await client.send("Network.enable");

  let depth = null;
  let state = null;
  let params = null;

  // XLM and the sponsors' spread commitment come over REST, on the same page.
  page.on("response", async (res) => {
    if (!/xetra_trading_parameter/.test(res.url()) || res.status() !== 200) return;
    try {
      const j = await res.json();
      if (j && j.isin === isin) params = j;
    } catch {}
  });

  client.on("Network.webSocketFrameReceived", ({ response }) => {
    const d = String(response.payloadData);
    if (!d.includes(isin)) return;
    if (d.includes("dataMarketdepth")) {
      try {
        const p = JSON.parse(d).dataMarketdepth;
        if (p?.bidSide?.length && p?.askSide?.length) depth = p;
      } catch {}
    }
    if (d.includes("dataMarketstate") && d.includes('"quality"')) {
      try {
        state = JSON.parse(d).dataMarketstate;
      } catch {}
    }
  });

  await page.goto(`https://live.deutsche-boerse.com/etf/${isin}`, {
    waitUntil: "networkidle2",
    timeout: 90000,
  });
  // The depth subscription arrives a few seconds after the page settles.
  for (let i = 0; i < 20 && !depth; i++) await new Promise((r) => setTimeout(r, 1000));

  await page.close();
  return { depth, state, params };
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
  protocolTimeout: 240000,
});
for (const p of await browser.pages()) {
  if (/deutsche-boerse\.com/.test(p.url())) await p.close().catch(() => {});
}

const out = [];
for (const c of CASES) {
  const { depth, state, params } = await bookFor(browser, c.isin);
  if (params?.xlm != null && c.xlm == null) c.xlm = params.xlm;
  if (!depth) {
    console.log(`${c.name}: no order book captured`);
    out.push({ ...c, error: "no book" });
    continue;
  }

  const asks = [...depth.askSide].sort((a, b) => a.price - b.price);
  const bids = [...depth.bidSide].sort((a, b) => b.price - a.price);
  const buy = walk(asks, c.n);
  const sell = walk(bids, c.n);
  const predicted = buy.cash - sell.cash;
  const notional = buy.cash;

  out.push({
    ...c,
    at: depth.datetime,
    quality: state?.quality ?? "?",
    maxSpread: params?.maxSpread ?? null,
    minQuoteVolume: params?.minQuoteVolume ?? null,
    sponsors: params?.designatedSponsors?.length ?? null,
    touchBid: bids[0].price,
    touchAsk: asks[0].price,
    touchSpread: +(asks[0].price - bids[0].price).toFixed(4),
    bidDepthAtTouch: bids[0].quantity,
    askDepthAtTouch: asks[0].quantity,
    predicted: +predicted.toFixed(4),
    notional: +notional.toFixed(2),
    buyLevels: buy.used,
    sellLevels: sell.used,
    exhausted: buy.exhausted || sell.exhausted,
    xlmPredicted: c.xlm != null ? +((notional * c.xlm) / 2 / 10000).toFixed(4) : null,
  });
}

fs.writeFileSync(new URL("t212-prediction.json", import.meta.url), JSON.stringify(out, null, 2));

console.log(
  "\nETF  | n  | carnet à       | bid / ask       | spread | prof. touch | carnet prédit | XLM÷2 prédit | mesuré"
);
console.log("-".repeat(112));
for (const r of out) {
  if (r.error) continue;
  console.log(
    `${r.name.padEnd(4)} | ${String(r.n).padEnd(2)} | ${String(r.at).slice(11, 19)}       | ` +
      `${`${r.touchBid} / ${r.touchAsk}`.padEnd(15)} | ${String(r.touchSpread).padEnd(6)} | ` +
      `${`${r.bidDepthAtTouch} / ${r.askDepthAtTouch}`.padEnd(11)} | ` +
      `${(r.predicted.toFixed(2) + " €").padEnd(13)} | ` +
      `${(r.xlmPredicted != null ? r.xlmPredicted.toFixed(2) + " €" : "—").padEnd(12)} | ` +
      `${r.measured != null ? r.measured.toFixed(2) + " €" : "—"}`
  );
}

console.log("\nlevels consumed (order book walk):");
for (const r of out) {
  if (r.error) continue;
  const f = (ls) => ls.map((l) => `${l.take}@${l.price}`).join(" + ");
  console.log(`  ${r.name} n=${r.n}: achat ${f(r.buyLevels)} | vente ${f(r.sellLevels)}`);
}

console.log(`\ndata quality: ${out.find((o) => !o.error)?.quality ?? "?"} (Xetra gratuit = 15 min de retard)`);

await browser.disconnect();

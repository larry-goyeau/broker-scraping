// Records how the Xetra top of book moves over time, to see how stable the spread
// really is and therefore how much confidence a cost prediction deserves.
//
//   node trading212/t212-spread-watch.mjs IE00BKM4GZ66 90 20

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const ISIN = process.argv[2] || "IE00BKM4GZ66";
const SECONDS = Number(process.argv[3] || 90);
const N = Number(process.argv[4] || 20);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
  protocolTimeout: 300000,
});
for (const p of await browser.pages()) {
  if (/deutsche-boerse\.com/.test(p.url())) await p.close().catch(() => {});
}

const page = await browser.newPage();
const client = await page.createCDPSession();
await client.send("Network.enable");

const samples = [];
client.on("Network.webSocketFrameReceived", ({ response }) => {
  const d = String(response.payloadData);
  if (!d.includes(ISIN) || !d.includes("dataMarketdepth")) return;
  let p;
  try {
    p = JSON.parse(d).dataMarketdepth;
  } catch {
    return;
  }
  if (!p?.bidSide?.length || !p?.askSide?.length) return;
  const asks = [...p.askSide].sort((a, b) => a.price - b.price);
  const bids = [...p.bidSide].sort((a, b) => b.price - a.price);

  // Consume N shares from each side to get the true round-trip cost.
  const walk = (levels) => {
    let left = N;
    let cash = 0;
    for (const l of levels) {
      if (left <= 0) break;
      const take = Math.min(left, l.quantity);
      cash += take * l.price;
      left -= take;
    }
    return { cash, short: left };
  };
  const buy = walk(asks);
  const sell = walk(bids);

  samples.push({
    at: p.datetime,
    bid: bids[0].price,
    ask: asks[0].price,
    spread: +(asks[0].price - bids[0].price).toFixed(4),
    bidQty: bids[0].quantity,
    askQty: asks[0].quantity,
    cost: +(buy.cash - sell.cash).toFixed(4),
    notional: +buy.cash.toFixed(2),
    short: buy.short > 0 || sell.short > 0,
  });
});

await page.goto(`https://live.deutsche-boerse.com/etf/${ISIN}`, {
  waitUntil: "networkidle2",
  timeout: 90000,
});
await new Promise((r) => setTimeout(r, SECONDS * 1000));
await page.close();

fs.writeFileSync(new URL("spread-watch.json", import.meta.url), JSON.stringify({ isin: ISIN, n: N, samples }, null, 2));

console.log(`${samples.length} mises à jour du carnet sur ~${SECONDS}s (données différées de 15 min)\n`);
console.log("heure UTC | bid      | ask      | spread | prof. bid/ask | coût n=" + N);
console.log("-".repeat(74));
for (const s of samples) {
  console.log(
    `${String(s.at).slice(11, 19)}  | ${String(s.bid).padEnd(8)} | ${String(s.ask).padEnd(8)} | ` +
      `${String(s.spread).padEnd(6)} | ${`${s.bidQty} / ${s.askQty}`.padEnd(13)} | ${s.cost.toFixed(2)} €${s.short ? "  (carnet épuisé)" : ""}`
  );
}

if (samples.length) {
  const sp = samples.map((s) => s.spread);
  const co = samples.map((s) => s.cost);
  const stats = (a) => ({
    min: Math.min(...a),
    max: Math.max(...a),
    mean: a.reduce((x, y) => x + y, 0) / a.length,
  });
  const S = stats(sp);
  const C = stats(co);
  console.log(
    `\nspread : min ${S.min} / moyen ${S.mean.toFixed(4)} / max ${S.max}  ` +
      `(amplitude ×${(S.max / S.min).toFixed(2)})`
  );
  console.log(
    `coût   : min ${C.min.toFixed(2)} € / moyen ${C.mean.toFixed(2)} € / max ${C.max.toFixed(2)} €`
  );
}

await browser.disconnect();

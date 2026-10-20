// Nxchange cash touch. Bid and ask are the best buy and best sell orders
// of the venue's own order board, the JSON its "Investeren" page reads for
// every listing; the last is that page's rate. Prices are in euro cents
// (190 is €1.90). A one-sided board keeps no touch.
//
//   https://account.nxchange.com/order-board/<CODE>.json?limit=5
//   https://account.nxchange.com/rates/<CODE>.json
//
// Trading is permitted 24 hours a day, seven days a week, apart from
// maintenance, which is scheduled between Friday 21:00 and Monday 05:00
// (Rulebook v3.0, articles 16 and 24), so the board is read at any hour.
//   https://cdn.prod.website-files.com/6603ca52d62c204544f53351/66c8625c2f9d626e5d7e81f7_75df5613c3458622b6fe61b81b5076d5_Nxchange_Rulebook_ENG_v3.0_def.pdf
// The reading is nxchange-touch.json. spread.mjs copies it into
// spread.json (`--only=nxchange-touch`); prices.mjs takes the last.
//
//   node spreads/nxchange-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./nxchange-touch.json", import.meta.url));
const SITE = "https://account.nxchange.com";
const NXCHANGE = new Set(["nxchange", "xnxc", "xnxd"]);

const amsterdam = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

async function json(path) {
  const response = await fetch(`${SITE}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
}

const jobs = new Map();
for (const row of catalogueRows()) {
  if (!NXCHANGE.has(norm(row.exchange))) continue;
  const code = String(row.ticker || "").trim().toUpperCase();
  const isin = String(row.isin || "").toUpperCase();
  if (code && /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) jobs.set(code, isin);
}

const now = new Date();
const found = [];
let oneSided = 0;
for (const [code, isin] of jobs) {
  const board = await json(`/order-board/${encodeURIComponent(code)}.json?limit=5`);
  const rate = await json(`/rates/${encodeURIComponent(code)}.json`).catch(() => null);
  const bid = Math.max(0, ...(board.buy || []).map((o) => Number(o.rate))) / 100;
  const asks = (board.sell || []).map((o) => Number(o.rate)).filter((x) => x > 0);
  const ask = asks.length ? Math.min(...asks) / 100 : 0;
  const last = Number(rate?.rate) / 100;
  const bp = bpFrom(bid, ask);
  if (bp == null) oneSided += 1;
  found.push({
    isin,
    mic: "XNXC",
    code,
    ...(bid > 0 ? { bid } : {}),
    ...(ask > 0 ? { ask } : {}),
    ...(last > 0 ? { last, lastAt: rate.time } : {}),
    ...(bp != null ? { bp } : {}),
    currencies: ["EUR"],
    stamp: `${amsterdam.format(now)} ${clock.format(now)}`,
    url: `${SITE}/order-board/${code}.json`,
  });
}

found.sort((a, b) => a.code.localeCompare(b.code));
if (!found.length) {
  console.error("aucune ligne Nxchange dans les catalogues.");
  process.exit(1);
}
fs.writeFileSync(STORE, JSON.stringify({ at: now.toISOString(), date: amsterdam.format(now), rows: found, oneSided }, null, 2));
console.error(`${STORE} : ${found.length} lignes, ${found.length - oneSided} touches à deux côtés, ${oneSided} à un seul côté.`);

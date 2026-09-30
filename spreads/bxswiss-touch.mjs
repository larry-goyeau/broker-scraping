// Best bid and best ask printed on the public BX Swiss instrument list.
// One card is one listing, in the currency the card names. A missing side
// stays empty. A zero or crossed book is not a spread.
//
//   node bxswiss-touch.mjs

import fs from "node:fs";

const OUT = new URL("./bxswiss-touch.json", import.meta.url);
const SIZE = 500;
const LIST = (page) =>
  `https://www.bxswiss.com/instruments/az/-/-/-/-/-/-/-/-/${page}/${SIZE}`;

const num = (text) => {
  const cleaned = String(text || "")
    .replace(/[’'′\s]/g, "")
    .trim();
  if (!cleaned || cleaned.includes("{{") || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? n : null;
};

function cardsOf(html) {
  const out = [];
  for (const card of html.split('class="box box--minimal js-box"').slice(1)) {
    const isin = card.match(/data-id="([A-Z]{2}[A-Z0-9]{10})"/)?.[1];
    if (!isin) continue;
    const bidText = card.match(/js-bid">([^<]*)</)?.[1] ?? "";
    const askText = card.match(/js-ask">([^<]*)</)?.[1] ?? "";
    if (bidText.includes("{{") || askText.includes("{{")) continue;
    const currency = card.match(/heading--small">Bid<\/span>\s*<span class="small">([A-Z]{3})<\/span>/)?.[1] || null;
    const bid = num(bidText);
    const ask = num(askText);
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : null;
    const perShare = bid > 0 && ask > 0 && ask > bid ? Number((ask - bid).toPrecision(8)) : null;
    const bp = perShare != null && mid > 0 ? Number(((1e4 * perShare) / mid).toPrecision(6)) : null;
    out.push({ isin, currency, bid, ask, mid, perShare, bp });
  }
  return out;
}

const byIsin = {};
let page = 1;

for (;;) {
  const res = await fetch(LIST(page), { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} page ${page}`);
  const found = cardsOf(await res.text());
  if (!found.length) break;
  for (const row of found) {
    if (!row.currency) continue;
    const book = (byIsin[row.isin] ||= {});
    book[row.currency] = {
      bid: row.bid,
      ask: row.ask,
      mid: row.mid,
      perShare: row.perShare,
      bp: row.bp,
    };
  }
  console.error(`page ${page}: ${found.length} lignes`);
  if (found.length < SIZE) break;
  page += 1;
}

let quoted = 0;
let oneSided = 0;
let empty = 0;
for (const book of Object.values(byIsin)) {
  for (const row of Object.values(book)) {
    if (row.bp > 0) quoted += 1;
    else if (row.bid > 0 || row.ask > 0) oneSided += 1;
    else empty += 1;
  }
}
const stats = { quoted, oneSided, empty, asked: Object.keys(byIsin).length };
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      asOf: new Date().toISOString(),
      source: "https://www.bxswiss.com/instruments/az",
      measure: "touche du carnet public BX Swiss, aller-retour (ask − bid)",
      ...stats,
      byIsin,
    },
    null,
    2
  )
);
console.error(`écrit ${stats.quoted} carnets / ${stats.asked} ISINs dans ${OUT.pathname}`);

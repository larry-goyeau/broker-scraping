// What BCC Brescia (Banca di Credito Cooperativo di Brescia) sells through
// Inbank Trading on Borsa Italiana's markets and on Cboe Europe, with no
// login.
//
// "Inbank trading: Lo strumento ideale per te che vuoi operare sui
// principali mercati finanziari ed investire in sicurezza."
//   https://www.bccbrescia.it/privati/banca-digitale/trading-online/
// The bank publishes no list of what it sells.
//
// Places. The "Dossier titoli standard" information sheet (aggiornato al
// 06/07/2026), "Commissioni raccolta ordini - Internet", prices
// "Commissioni azioni/ETF Italia (massime) su mercato Italia" and
// "Commissioni azioni/ETF Italia (massime) su mercato CHI-X" (Cboe's
// former name), and "Commissioni azioni/ETF Estero".
//   https://www.bccbrescia.it/umbraco/surface/transparency/ShowFile/62389
// broker-list.json gives Italy and Cboe Europe. Foreign shares ("Estero")
// are not this broker's places in broker-list.json and are not read.
// - Italy: "mercato Italia" names no market, so it is Borsa Italiana's
//   share and ETP markets: Euronext Milan (STAR included) and ETFplus, and
//   Euronext Growth Milan, read by ../vivibanca/euronextMilanBook.mjs with
//   `growth: true` (shares, ETFs, ETCs, ETNs; minus warrants and rights,
//   halted lines, shares with no trade in 30 days (180 on Growth), and
//   never-traded lines). Euronext Global Equity Market, EuroTLX and
//   SeDeX are other markets and are not read.
// - Cboe Europe: "azioni/ETF Italia ... su mercato CHI-X", so the Italian
//   lines (Euronext Milan shares and ETFplus products) that Cboe's own
//   symbol file lists live on its EU book, DXE (Cboe Europe B.V., the book
//   EU investors' orders reach since 2021; MIC CEUX), matched on ISIN,
//   currency and home market (MTAA, ETFP):
//     https://www.cboe.com/europe/equities/market_statistics/symbols_traded/csv/?mkt=dxe
//   Written as exchange "Cboe Europe DXE", MIC CEUX, as ../dnb writes it.
//
// "All shares includes ETFs": the bank prices "azioni/ETF" on both
// markets, so ETFs, ETCs and ETNs stay.
//
// Fees: same sheet, "Commissioni raccolta ordini - Internet":
// "Commissioni azioni/ETF Italia (massime) su mercato Italia 0,25%
// Minimo: € 5,00 Massimo: € 150,00", "su mercato CHI-X 0,28% Minimo:
// € 5,25 Massimo: € 150,25"; plus the Inbank Trading fee of "€ 6,00"
// a month (sheet "Servizio di Banca elettronica: INBANK TRADING").
//   https://www.bccbrescia.it/umbraco/surface/transparency/ShowFile/62672
//
//   node brokers/bccbrescia/bccbrescia_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { milanBook } from "../vivibanca/euronextMilanBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("bccbrescia-parsed.json", import.meta.url);
const DXE = "https://www.cboe.com/europe/equities/market_statistics/symbols_traded/csv/?mkt=dxe";

await pageSays("https://www.bccbrescia.it/privati/banca-digitale/trading-online/", [/Inbank trading/i, /principali mercati finanziari/]);

// Cboe's DXE symbol file: "ISIN|currency|home MIC" of the live lines.
async function dxeLive() {
  const response = await fetch(DXE, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Cboe DXE symbol file answered ${response.status}`);
  const lines = (await response.text()).split(/\r?\n/).slice(1).filter(Boolean);
  const cells = (line) => [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"')).slice(0, -1);
  const header = cells(lines[0]);
  const [isinAt, currencyAt, micAt, liveAt] = ["isin", "currency", "mic", "live"].map((name) => header.indexOf(name));
  if (isinAt < 0 || currencyAt < 0 || micAt < 0 || liveAt < 0) throw new Error("Cboe DXE symbol file header moved");
  const live = new Set();
  for (const line of lines.slice(1)) {
    const row = cells(line);
    if (row[liveAt] === "t") live.add(`${row[isinAt]}|${row[currencyAt]}|${row[micAt]}`);
  }
  if (live.size < 3000) throw new Error(`Cboe DXE symbol file has only ${live.size} live lines`);
  return live;
}

// Euronext's table answers the 2,088 ETFplus trackers only in pages (28 October 2026).
const book = await milanBook({ growth: true, pageSize: 1000 });
const italy = book.listed.filter((row) => ["STOCK", "ETF", "ETC", "ETN"].includes(row.type));
const live = await dxeLive();
const onCboe = italy
  .filter((row) => row.mic === "XMIL" && live.has(`${row.isin}|${row.currency}|${row.type === "STOCK" ? "MTAA" : "ETFP"}`))
  .map((row) => ({ ...row, exchange: "Cboe Europe DXE", mic: "CEUX", raw: `${row.raw} | Cboe DXE` }));
const cboeShares = onCboe.filter((r) => r.type === "STOCK").length;
if (cboeShares < 150 || onCboe.length < 1000) throw new Error(`only ${onCboe.length} Milan lines (${cboeShares} shares) matched on Cboe DXE`);

const kept = stampRows(withoutObligations([...italy, ...onCboe]));
for (const [isin, place] of [["IT0003128367", "Euronext Milan"], ["IT0003128367", "Cboe Europe DXE"], ["IE00B4L5Y983", "Euronext Milan"]]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place)) throw new Error(`${isin} missing on ${place}`);
}
if (kept.filter((r) => r.exchange === "Euronext Growth Milan").length < 100) throw new Error("Growth Milan too small");
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(`${kept.length} lines (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}); ${book.suspended.length} halted and ${book.idle.length} idle Milan lines left out`);

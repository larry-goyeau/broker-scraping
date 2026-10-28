// Lægernes Bank (Lægernes Pension & Bank, Denmark) prints no list of its
// own. Its netbank trades shares listed on Nasdaq and Danish investment
// fund certificates, and it only holds Danish securities in custody, so the
// catalogue is the Nasdaq Copenhagen main market book
// (../frslevmollerupsp/copenhagenBook.mjs) minus the foreign lines.
//
// What it sells, from its own pages (no login):
// - Fee list, "Fondshandel via netbank": "Køb og salg af aktier noteret på
//   Nasdaq OMX Nordic samt noterede og unoterede investeringsbeviser" 0.10%
//   of the trade value, min. 29 kr.; Lægernes Invest certificates 0 kr.;
//   limit order 50 kr.; +200 kr. when staff place the order.
//   https://www.lpb.dk/media/0e1d413b-6ac3-4e9a-b8ec-5c7be09b482b/IlaeTg/Dokumenter/Bank/Priser%20og%20vilk%C3%A5r/Priser/Aktuelle%20gebyrer.pdf
// - "Invester selv": custody covers "børsnoterede danske aktier,
//   investeringsbeviser og obligationer (undtagen udenlandske
//   værdipapirer)".
//   https://www.lpb.dk/Bank/Investering/Invester-selv
// - Aktiesparekonto: "børsnoterede danske aktier og udbyttebetalende
//   investeringsforeninger, hvor aktieandelen er 50% eller mere". This is
//   a rule of that tax account only, so it is a remark, not a removal.
//   https://www.lpb.dk/Bank/Investering/Aktiesparekonto
//
// Kept: the Nasdaq Copenhagen main market shares (Large, Mid and Small Cap)
// and listed investment funds and AIFs whose ISIN is Danish (DK), or from
// the Faroe Islands or Greenland (FO, GL: Danish realm, registered in the
// Danish central securities depository). Funds are type FUND. Currency is
// the line's trading currency on Nasdaq (DKK).
// Left out:
// - Foreign securities ("undtagen udenlandske værdipapirer"): lines with
//   any other ISIN country, such as Nordea (FI), Sampo (FI), Boozt (SE),
//   the XACT OMXC25 ETF (SE), and the Norwegian and Luxembourg fund
//   classes. Nasdaq Stockholm and Helsinki shares ("Nasdaq OMX Nordic")
//   are foreign for the same reason.
// - First North Denmark: the fee list names shares "noteret" (listed) on
//   Nasdaq, and First North is a multilateral trading facility, another
//   place in broker-list.json.
// - Suspended, halted, delisted or never-traded lines (copenhagenBook.mjs).
// - Bonds, warrants and structured products, as in the other scrapers.
//
// Fees: https://www.lpb.dk/media/0e1d413b-6ac3-4e9a-b8ec-5c7be09b482b/IlaeTg/Dokumenter/Bank/Priser%20og%20vilk%C3%A5r/Priser/Aktuelle%20gebyrer.pdf
//
//   node brokers/lgernes/lgernes_scraping.mjs

import { copenhagenBook } from "../frslevmollerupsp/copenhagenBook.mjs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const DANISH = new Set(["DK", "FO", "GL"]);

const { listed, suspended, leftOut } = await copenhagenBook({ funds: true, firstNorth: false });
const foreign = listed.filter((row) => !DANISH.has(row.isin.slice(0, 2)));
const rows = listed.filter((row) => DANISH.has(row.isin.slice(0, 2)));
if (rows.filter((row) => row.type === "STOCK").length < 90) throw new Error("too few Danish shares");

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("lgernes-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.type} ${row.currency}`] = (counts[`${row.type} ${row.currency}`] || 0) + 1;
console.error(`${kept.length} rows ${JSON.stringify(counts)}`);
console.error(`${foreign.length} foreign lines left out: ${foreign.map((row) => `${row.ticker} (${row.isin.slice(0, 2)})`).join(", ")}`);
console.error(`${suspended.length} suspended left out${leftOut.length ? `; also left out: ${leftOut.join(", ")}` : ""}`);

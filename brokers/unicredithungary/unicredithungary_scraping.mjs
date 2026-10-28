// What UniCredit Bank Hungary sells on the Budapest Stock Exchange (BÉT),
// with no login. The bank offers one market, BÉT, through its branches,
// Telefonbank, eBanking (SpectraNet) and the mBanking app:
//
//   https://www.unicreditbank.hu/hu/maganszemelyek/megtakaritasok/reszvenyek.html
//   "megbízást adni a Budapesti Értéktőzsdén (BÉT) forgalmazott
//    részvényekre" (orders on the shares traded on BÉT)
//   https://www.unicreditbank.hu/hu/maganszemelyek/napi_penzugyek/elektronikus_bankolas/mbanking_befektetes.html
//   mBanking: "Budapesti Értéktőzsdére (BÉT) bevezetett részvények
//   (limitáras megbízással)"; "Csak limitáras megbízást tudunk befogadni"
//   (limit orders only).
//
// The fee list (Lakossági kondíciós lista - értékpapír forgalom és
// teljesítési rend, in force from 2026-10-01) prices every BÉT security
// except certificates, and names what the bank does not take:
//   "Budapesti Értéktőzsdére (BÉT) bevezetett értékpapírok esetében (kivéve
//    certifikátok) 1% min. HUF 3.000"; "EUR-ban denominált részvények
//    esetében 1% min. EUR 8"
//   footnote 1: "A Budapesti Értéktőzsdére bevezetett certifikátok és nem
//    HUF-ban kereskedett értékpapírok adásvételére nem vesz fel megbízást a
//    Bank, kivéve EUR-ban denominált részvények." (no orders on BÉT
//    certificates or on securities not traded in HUF, except EUR shares)
// Its settlement and order-hours sections cover BÉT "részvényekre,
// befektetési - és kárpótlási jegyekre" (shares, fund units including
// ETFs, compensation notes), so ETFs stay in.
//   https://www.unicreditbank.hu/content/dam/cee2020-pws-hu/Maganszemelyek/Megtakaritasok/2026/202610/Lakossagi%20KL_Ertekpapir_forgalom_Teljesitesi_Rend_260930_261001.pdf
//
// So the catalogue is the whole BÉT book (../unicredithungary/bseBook.mjs:
// Prime, Standard, Xtend, BÉT ETFs, BETa foreign shares and ETFs/ETCs),
// minus every line that does not trade in HUF unless it is a share: today
// that removes the EUR ETF ETFCETOPOTP; the EUR shares (GSPARK, SPLUS,
// UPLAZA, O3PNRS) stay. Certificates, warrants, bonds and closed-end fund
// units are not in the book (house rule), and the book already drops
// delisted, suspended, in-liquidation and never-traded lines.
//
// Remarks, not removals: the bank "fenntartja azt a jogát, hogy a
// Budapesti Értéktőzsdére bevezetett bizonyos termékekre nézve ne vegyen
// fel megbízást" (may refuse orders on some BÉT products, ask a branch);
// mBanking takes shares only and limit orders only (broker-list.json:
// "Limit orders only (mBanking)"); ETFs go through eBanking, Telefonbank or
// a branch.
//
//   node brokers/unicredithungary/unicredithungary_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bseBook } from "./bseBook.mjs";
import fs from "node:fs";

const book = await bseBook();
const dropped = [];
const rows = [];
for (const row of book) {
  if (row.currency !== "HUF" && row.type !== "STOCK") {
    dropped.push(`${row.ticker} (${row.type} in ${row.currency})`);
    continue;
  }
  rows.push(row);
}
if (rows.length < 90) throw new Error(`only ${rows.length} BÉT lines`);
for (const [ticker, isin, currency] of [
  ["OTP", "HU0000061726", "HUF"],
  ["MOL", "HU0000153937", "HUF"],
  ["GSPARK", "HU0000083696", "EUR"],
]) {
  const found = rows.find((row) => row.ticker === ticker);
  if (!found || found.isin !== isin || found.currency !== currency) throw new Error(`${ticker} was ${JSON.stringify(found)}`);
}

const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("unicredithungary-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
const counts = {};
for (const row of written) counts[`${row.type} ${row.currency}`] = (counts[`${row.type} ${row.currency}`] || 0) + 1;
console.error(counts);
console.error(`${written.length} rows; left out (not traded in HUF, not a share): ${dropped.join("; ") || "none"}`);

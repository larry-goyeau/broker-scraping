// What Raiffeisen Switzerland (the Raiffeisen banks' E-Banking) sells on
// the Swiss exchanges to a client who trades himself, with no login.
//
// "Über das Raiffeisen E-Banking handeln Sie online eine Vielzahl von
// Finanzinstrumenten. Oder auch telefonisch durch Ihre Kundenberaterin oder
// Ihren Kundenberater." Raiffeisen publishes no list of what it sells.
//   https://www.raiffeisen.ch/rch/de/privatkunden/anlegen/selbstaendig-anlegen.html
//
// Places. The E-Banking price list ("Dienstleistungspreise Anlegen – Gültig
// ab 1. Januar 2026", "Wertschriftenhandel – Courtage E-Banking") prices
// "Aktien, Strukturierte Produkte & börsengehandelte Fonds" in "Schweiz*",
// and its footnote names the Swiss venues: "* SIX Swiss Exchange, SIX
// Swiss Exchange Blue Chip, SIX Structured Products Exchange, Berner Börse
// / Strukturierte Produkte". The Berner Börse is BX Swiss's former name.
//   https://www.raiffeisen.ch/content/dam/www/rch/pdf/e-banking/no-index/de/dienstleistungspreise-anlegen-e-banking.pdf
// broker-list.json gives the same two places (SIX Swiss Exchange, BX
// Swiss). "Ausland & ausserbörslich gehandelte Aktien" (another column of
// the same table) are not this broker's places in broker-list.json and are
// not read.
//
// So the catalogue is the whole of both books, as no Raiffeisen page narrows
// them:
// - SIX Swiss Exchange through ../migros/sixBook.mjs: shares, ETFs and ETPs,
//   one row per ISIN and trading currency, minus rights, second lines,
//   suspended, delisted, never-traded and dormant lines (listed funds are
//   dropped by stampRows, as for every catalogue).
// - BX Swiss through ../zurcherkantonalb/bxBook.mjs (BX Swiss's own
//   instrument list): shares, ETFs and ETPs, one row per ISIN and trading
//   currency, minus actively managed certificates, deriBX structured
//   products, bonds, funds and lines with no quote.
//
// Fees: same price list, "Standard-Tarif", Aktien ... Schweiz: "Für die
// ersten CHF 100'000 0.50 %", "+ für Beträge über CHF 100'000 0.10 %",
// "Minimum E-Banking CHF 5.00".
//
//   node brokers/raiffeisench/raiffeisench_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { sixBook } from "../migros/sixBook.mjs";
import { bxBook } from "../zurcherkantonalb/bxBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("raiffeisench-parsed.json", import.meta.url);

await pageSays("https://www.raiffeisen.ch/rch/de/privatkunden/anlegen/selbstaendig-anlegen.html", [/E-Banking/, /handeln Sie online eine Vielzahl von Finanzinstrumenten/]);

const six = await sixBook();
const bx = await bxBook();
const rows = [...six.rows.map(({ segment, ...row }) => row), ...bx.rows.map(({ listed, ...row }) => row)];
const kept = stampRows(withoutObligations(rows));
if (kept.filter((r) => r.exchange === "SIX Swiss Exchange").length < 3000) throw new Error("SIX book too small");
if (kept.filter((r) => r.exchange === "BX Swiss").length < 2500) throw new Error("BX Swiss book too small");
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(`${kept.length} lines (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")})`);

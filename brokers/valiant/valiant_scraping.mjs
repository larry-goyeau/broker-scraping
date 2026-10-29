// What Valiant Bank sells to an "Execution only" client on the Swiss and US
// exchanges, with no login.
//
// Execution only: "Sie legen am liebsten selbständig an? Wählen Sie aus dem
// gesamten Produkteangebot und wickeln Sie Ihre Geschäfte selber ab",
// "Handel via E-Banking, Mobile Banking oder telefonisch", "Bei Onlinehandel
// 50% Rabatt auf Courtagen".
//   https://www.valiant.ch/de/privatkunden/anlegen-anlageloesungen-execution-only
// Valiant publishes no list of what it sells.
//
// Places: Switzerland and the United States, as broker-list.json gives them.
// The tariff prices "Courtagen Börsengeschäfte" for "Inland" and "Ausland"
// alike and names no venue, and no Valiant page leaves a segment, a product
// type or US-domiciled ETFs out (a Swiss execution-only client buys without
// a PRIIPs KID). So:
// - Switzerland: the SIX Swiss Exchange book, as for the other Swiss banks
//   whose place is "Switzerland" (../migros, ../banquecantonalen), read by
//   ../migros/sixBook.mjs (shares, ETFs and ETPs, one row per ISIN and
//   trading currency, minus rights, second lines, suspended, delisted,
//   never-traded and dormant lines; listed funds are dropped by stampRows).
//   BX Swiss is not read: no Valiant page names it.
// - United States: the whole US exchange book, ../wellstrade/usBook.mjs (one
//   NBBO market, one row per title on its primary listing: shares, ADRs,
//   REITs, preferreds, closed-end funds, ETFs, ETNs; minus warrants, rights,
//   units, when-issued lines, notes and halted lines). OTC Markets is not
//   read: no Valiant page offers it.
//
// Fees: "Factsheet Anlagelösungen und Preismodelle", "Tarife Courtagen
// Börsengeschäfte und Kommissionen Anlagefonds": Aktien Inland "Bis CHF
// 25 000.00 1,10 %", Ausland "1,70 %"; Execution only "50 % Reduktion auf
// Courtagen und Fondskommissionen, auch auf Minimum" ("Die Reduktion wird
// ausschliesslich beim Börsenhandel via E-Banking gewährt").
//   https://www.valiant.ch/documents/35003/44319/Factsheet-Anlagelooesungen.pdf
//
//   node brokers/valiant/valiant_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { sixBook } from "../migros/sixBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("valiant-parsed.json", import.meta.url);

await pageSays("https://www.valiant.ch/de/privatkunden/anlegen-anlageloesungen-execution-only", [/Bei Onlinehandel 50% Rabatt auf Courtagen/, /Handel via E-Banking, Mobile Banking/]);

const six = await sixBook();
const us = await usBook();
const rows = [...six.rows.map(({ segment, ...row }) => row), ...us];
const kept = stampRows(withoutObligations(rows));
if (kept.filter((r) => r.exchange === "SIX Swiss Exchange").length < 3000) throw new Error("SIX book too small");
if (kept.filter((r) => r.exchange !== "SIX Swiss Exchange").length < 8000) throw new Error("US book too small");
for (const isin of ["CH0038863350", "US0378331005", "US78462F1030"]) if (!kept.some((r) => r.isin === isin)) throw new Error(`${isin} missing`);
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(`${kept.length} lines (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")})`);

// What Freiburger Kantonalbank / Banque Cantonale de Fribourg (FKB/BCF)
// sells on the Swiss exchanges to a client who trades in e-banking, with
// no login.
//
// The e-banking page: "Sie geben Börsengeschäfte selbst in Auftrag".
//   https://www.bcf.ch/de/privatkunden/digitale-dienstleistungen/digital-banking/e-banking
// FKB publishes no list of what it sells.
//
// Places. The tariff "Preise für unsere Dienstleistungen – Vermögens-
// verwaltung" (gültig ab 1. Juli 2026), "Transaktionsgebühren", prices
// "Aktien und ähnliche Papiere" on "Börsenplätze Schweiz" and "Börsenplätze
// Ausland", and "e-banking und Mobile Banking – ermässigter Basistarif":
// "50% Rabatt auf die Basistarife für Transaktionen auf Börsenplätzen
// Schweiz".
//   https://www.bcf.ch/sites/default/files/medias/documents/fkb-tarife-vermoegensverwaltung.pdf
// "Börsenplätze Schweiz" names no venue, so it is both Swiss exchanges;
// broker-list.json gives the same two places (SIX Swiss Exchange, BX
// Swiss). The foreign exchanges are not this broker's places in
// broker-list.json and are not read.
//
// So the catalogue is the whole of both books, as no FKB page narrows
// them:
// - SIX Swiss Exchange through ../migros/sixBook.mjs: shares, ETFs and ETPs,
//   one row per ISIN and trading currency, minus rights, second lines,
//   suspended, delisted, never-traded and dormant lines (listed funds are
//   dropped by stampRows).
// - BX Swiss through ../zurcherkantonalb/bxBook.mjs: shares, ETFs and ETPs,
//   one row per ISIN and trading currency, minus actively managed
//   certificates, deriBX structured products, bonds, funds and lines with
//   no quote.
//
// Fees: same tariff, "Aktien und ähnliche Papiere", Börsenplätze Schweiz
// "Bis 25'000 1,10%", "Mindestgebühr (CHF) 80.–", with the e-banking
// "50% Rabatt auf die Basistarife für Transaktionen auf Börsenplätzen
// Schweiz"; "Bei Transaktionen unter CHF 800.- für Börsenplätze Schweiz
// ... beträgt der Tarif 10%".
//
//   node brokers/freiburgerkanton/freiburgerkanton_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { sixBook } from "../migros/sixBook.mjs";
import { bxBook } from "../zurcherkantonalb/bxBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("freiburgerkanton-parsed.json", import.meta.url);

await pageSays("https://www.bcf.ch/de/privatkunden/digitale-dienstleistungen/digital-banking/e-banking", [/Sie geben B.rsengesch.fte selbst in Auftrag/]);

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

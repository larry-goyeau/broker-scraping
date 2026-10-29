// What Zürcher Kantonalbank (ZKB) sells to a self-directed client on the
// Swiss exchanges, with no login.
//
// ZKB Execution Only: "Erledigen Sie Ihre Aufträge mit der grösstmöglichen
// Unabhängigkeit via eBanking oder über Ihren persönlichen Berater. Sie
// erhalten Zugang zu einer grossen Bandbreite von Anlageprodukten, zum
// weltweiten Wertschriftenhandel".
//   https://www.zkb.ch/de/private/anlagen/anlageloesungen/execution-only.html
// ZKB publishes no list of what it sells.
//
// Places. ZKB's list of execution venues (Anhang 8 of its execution
// principles) names, for "Kotierte Schweizer Aktien, ETF und Strukturierte
// Produkte": "SIX Swiss Exchange, BX Swiss AG sowie andere
// Ausführungsplätze".
//   https://www.zkb.ch/media/dokumente/legal/ausfuehrungsplaetze.pdf
// broker-list.json gives the same two places (SIX Swiss Exchange, BX Swiss).
// Foreign exchanges ("Im Ausland börsenkotierte Aktien ... via Broker an
// diversen Ausführungsplätzen") are not this broker's places in
// broker-list.json and are not read.
//
// So the catalogue is the whole of both books, as no ZKB page narrows them:
// - SIX Swiss Exchange through ../migros/sixBook.mjs: shares, ETFs, listed
//   funds and ETPs, one row per ISIN and trading currency, minus rights,
//   second lines, suspended, delisted, never-traded and dormant lines.
// - BX Swiss through ./bxBook.mjs (BX Swiss's own instrument list): shares,
//   ETFs and ETPs, one row per ISIN and trading currency, minus actively
//   managed certificates, deriBX structured products, bonds, funds and
//   lines with no quote.
// A title on both exchanges has one row per exchange.
//
// Fees: "Preisübersicht Anlagegeschäft", 2.1 "Courtage für Aktien, andere
// börsengehandelte Papiere und Obligationen", Schweiz, "digitale Kanäle":
// "bis CHF 100'000.– 0,50%", "Mindestgebühr CHF 50.–" (other channels
// 1,00%, CHF 100.–).
//   https://www.zkb.ch/media/zkb/dokumente/legal/preisuebersichten/preisuebersicht-anlagegeschaeft.pdf
//
//   node brokers/zurcherkantonalb/zurcherkantonalb_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { sixBook } from "../migros/sixBook.mjs";
import { bxBook } from "./bxBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("zurcherkantonalb-parsed.json", import.meta.url);

// The sentences the catalogue rests on.
await pageSays("https://www.zkb.ch/de/private/anlagen/anlageloesungen/execution-only.html", [/via eBanking/, /weltweiten Wertschriftenhandel/]);

const six = await sixBook();
const bx = await bxBook();
const rows = [
  ...six.rows.map(({ segment, ...row }) => row),
  ...bx.rows.map(({ listed, ...row }) => row),
];
const kept = stampRows(withoutObligations(rows));
if (kept.filter((r) => r.exchange === "SIX Swiss Exchange").length < 3000) throw new Error("SIX book too small");
if (kept.filter((r) => r.exchange === "BX Swiss").length < 2500) throw new Error("BX Swiss book too small");
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(`${kept.length} lines (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")})`);

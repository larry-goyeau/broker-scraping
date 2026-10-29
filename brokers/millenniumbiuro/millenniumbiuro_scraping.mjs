// What Millennium Biuro Maklerskie (Bank Millennium's brokerage) sells
// online, with no login: every share and exchange-traded product of the
// Warsaw Stock Exchange's main market and of NewConnect.
//
// Its individual-account page: "prowizje od 0,38% za akcje i ETF-y (min.
// 4,90 zł)", the Statica 5MAX platform "i notowań GPW w czasie
// rzeczywistym", and orders by internet ("serwis internetowy", the ePromak
// Next app). Its fee table prices "akcje oraz pozostałe instrumenty
// finansowe" placed "przez Internet", on the GPW and NewConnect; it names no
// foreign market and no GPW board left out. broker-list.json gives the
// Warsaw Stock Exchange and NewConnect.
//
// The list is the exchange's (../trigondommaklers/gpwBook.mjs): the GPW
// main-market quote boards (continuous and single-price), NewConnect, and
// the GPW ETF board (ETFs, the ETC and the ETNs), each line with its ISIN,
// less suspended lines, lines being withdrawn or excluded, companies in
// liquidation or bankruptcy and lines that never traded. GlobalConnect
// (foreign shares on the GPW) is not offered on the broker's pages and is
// not read. Rights, warrants, structured products and bonds stay out. In
// zloty (XWAR, XNCO).
//
//   https://www.millenniumbm.pl/rachunki-maklerskie/rachunek-indywidualny
//   https://www.millenniumbm.pl/prowizje-i-oplaty
//   https://www.gpw.pl/akcje  https://newconnect.pl/notowania  https://www.gpw.pl/etfy
//
// Fees: https://www.millenniumbm.pl/delegate/managedfiles/2435/latest
// ("Tabela Opłat i Prowizji obowiązująca od 18.08.2025": "akcje oraz
// pozostałe instrumenty finansowe ... przez Internet ... Standard 0,38 %",
// not less than 2,3 zł per trade or 4,9 zł per order).
//
//   node brokers/millenniumbiuro/millenniumbiuro_scraping.mjs

import { writeGpwCatalogue } from "../trigondommaklers/gpwBook.mjs";
import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";

await says("https://www.millenniumbm.pl/rachunki-maklerskie/rachunek-indywidualny", [
  /prowizje od 0,38% za akcje i ETF-y \(min\. 4,90 zł\)/,
  /notowań GPW w czasie rzeczywistym/,
], { raw: true });
await says("https://www.millenniumbm.pl/prowizje-i-oplaty", [/Tabela Opłat i Prowizji obowiązująca od 18\.08\.2025/, /managedfiles\/2435\/latest/], { raw: true });
await pdfAnswers("https://www.millenniumbm.pl/delegate/managedfiles/2435/latest");

const rows = await writeGpwCatalogue(import.meta.url, "millenniumbiuro-parsed.json", { newConnect: true, etps: true, globalConnect: false });
if (rows.length < 500) throw new Error(`only ${rows.length} GPW rows`);

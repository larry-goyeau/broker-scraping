// Bank EEK (Bern): shares, ETFs and other listed products on SIX Swiss
// Exchange, through its e-banking.
//
// The bank prints no list of what it trades. Its e-banking page lists
// "Handel von Wertschriften" and "Wertschriftentransaktionen":
//   https://www.eek.ch/e-banking
// and its fee sheet "Courtage & Spesen" has one tariff for "Aktien, ETFs
// und ähnliche Papiere" (1.10 % up to CHF 50,000, minimum CHF 80, plus
// CHF 50 of foreign charges on foreign-currency titles). The transactional
// advisory page points to the same sheet:
//   https://www.eek.ch/de/anlegen/vermoegensverwaltung/transaktionsbezogen
//
// So the catalogue is the whole SIX book for the "Switzerland" place, read
// by brokers/migros/sixBook.mjs: Swiss and foreign shares (Sponsored
// Segment included), ETFs, listed and sponsored funds and exchange-traded
// products, one row per line (ISIN and trading currency). The bank's pages
// name no exception, so nothing more is removed. Left out by the shared
// module: warrants, structured products and bonds (other SIX segments),
// rights, second trading lines, delisted, suspended, dormant and
// never-traded lines.
//
// Fees: https://www.eek.ch/_Resources/Persistent/7/6/3/a/763ac5652e10a8fd46b4376b960e633941a2fde2/Bank_EEK_Courtage%26Spesen.pdf
//
//   node brokers/eek/eek_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Bank EEK",
  out: new URL("eek-parsed.json", import.meta.url),
});

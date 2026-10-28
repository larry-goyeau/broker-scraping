// Bank Gantrisch (Schwarzenburg, canton of Bern): shares, ETFs and other
// listed products on SIX Swiss Exchange, through its e-banking, mobile app
// or the phone.
//
// The bank prints no list of what it trades. Its execution-only page says
// clients get the whole investment universe:
//   "Mit Execution only (Ausführungsgeschäft) steht Ihnen das gesamte
//    Anlageuniversum zur Verfügung."
//   https://www.bankgantrisch.ch/KMU/Anlegen/Execution-only
// and the e-banking page lists "Zahlung und Börsenauftrag erfassen,
// verwalten und freigeben":
//   https://www.bankgantrisch.ch/Beginners/Zahlen/E-Banking
// The fee schedule prices "Aktien Inland" (min CHF 60, 1.00 % up to
// CHF 25,000) apart from "Aktien Ausland", with 50 % off for orders through
// e-banking or the app, and "Anlagefonds" separately.
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
// Fees: https://www.bankgantrisch.ch/images/content/Broschueren_Dokumente/Bank_Gantrisch_Gebuhrentarif.pdf
//
//   node brokers/gantrisch/gantrisch_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Bank Gantrisch",
  out: new URL("gantrisch-parsed.json", import.meta.url),
});

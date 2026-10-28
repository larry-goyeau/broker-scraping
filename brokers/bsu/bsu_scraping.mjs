// Bank BSU (Uster, canton of Zurich): shares, ETFs and other listed products
// on SIX Swiss Exchange, through its e-banking and mobile app.
//
// The bank prints no list of what it trades. Its Execution Only page says
// clients trade securities themselves in e-banking, whatever they choose:
//   "Wertschriftentransaktionen erledigen Sie direkt über E-Banking" and
//   "Jederzeit gewünschte Valoren selbst platzieren", with
//   "50% Courtage-Rabatt bei Abschlüssen in der Schweiz und im Ausland".
//   https://www.bankbsu.ch/privatkunden/anlegen/execution-only-modelle
// The e-banking page lists "Wertschriftenkäufe und -verkäufe tätigen" and the
// app "Börsengeschäfte tätigen":
//   https://www.bankbsu.ch/online-schalter/e-banking-und-app
// The «Preise & Gebühren» brochure prices "Tarife für Abschlüsse in der
// Schweiz – Aktien und ähnliche Papiere (Mindestcourtage CHF 80)" at 1.00 %
// up to CHF 25,000, with 50 % off and a CHF 40 minimum for execution-only
// orders, and charges the "SIX Swiss Exchange Gebühr" on ETF trades.
//
// So the catalogue is the whole SIX book, read by brokers/migros/sixBook.mjs:
// Swiss and foreign shares (Sponsored Segment included), ETFs, listed and
// sponsored funds and exchange-traded products, one row per line (ISIN and
// trading currency). No bank page names a segment, board or product it does
// not trade on SIX, so nothing more is removed. Execution Only and the app
// require "Wohnsitz in der Schweiz" / "Domizil Schweiz": a client
// restriction, not a removal. Left out by the shared module: warrants,
// structured products and bonds (other SIX segments), rights, second trading
// lines, delisted, suspended, dormant and never-traded lines.
//
// Fees: https://www.bankbsu.ch/fileadmin/BankBSU/Dokumente/AGBs/bsu_brosch_preise-gebuehren_privat-firmen.pdf
//
//   node brokers/bsu/bsu_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Bank BSU",
  out: new URL("bsu-parsed.json", import.meta.url),
});

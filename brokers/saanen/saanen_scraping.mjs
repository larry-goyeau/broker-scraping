// SB Saanen Bank (Saanen, canton of Bern): shares, ETFs and other listed
// products on SIX Swiss Exchange, through its e-banking, mobile app or the
// bank's securities desk.
//
// The bank prints no list of what it trades. Its investment-clients page
// says stock orders go through e-banking or its trading desk:
//   "Börsenaufträge können Sie jederzeit im E-Banking sowie zu den
//    Geschäftsöffnungszeiten über unseren Wertschriftenhandel platzieren."
//   https://www.saanenbank.ch/de/anlagekunden
// and the app lists "Börsengeschäfte tätigen und Depotbestände abfragen":
//   https://www.saanenbank.ch/de/privatkunden/zahlungen-taetigen/mobile-banking
// The fee schedule (page 11, "Courtagen Normaltarif / E-Banking") prices
// "Aktien / ETFs / Edelmetalle und strukturierte Produkte - in der Schweiz
// gehandelt" (minimum CHF 80, or CHF 10 through e-banking; 1.00 % / 0.75 %
// up to CHF 50,000), and "Für sämtliche Anlagefonds gelten die Courtage für
// Aktien / ETFs Schweiz".
//
// So the catalogue is the whole SIX book, read by brokers/migros/sixBook.mjs:
// Swiss and foreign shares (Sponsored Segment included), ETFs, listed and
// sponsored funds and exchange-traded products, one row per line (ISIN and
// trading currency). No bank page names a segment, board or product it does
// not trade on SIX ("Illiquide Anlageklassen wie Hedge-Fonds" are excluded
// from its asset-management mandates only), so nothing more is removed. The
// site says its products are "nur für Schweizer Kunden, die in der Schweiz
// wohnhaft sind": a client restriction, not a removal. Left out by the
// shared module: warrants, structured products and bonds (other SIX
// segments), rights, second trading lines, delisted, suspended, dormant and
// never-traded lines.
//
// Fees: https://www.saanenbank.ch/download/pictures/bb/339e1erfd7zlspdq5cmqidu4x552rv/dienstleistungen_a5_de_18.08.2026.pdf
//
//   node brokers/saanen/saanen_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Saanen Bank",
  out: new URL("saanen-parsed.json", import.meta.url),
});

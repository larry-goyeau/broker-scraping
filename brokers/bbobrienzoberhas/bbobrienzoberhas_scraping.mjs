// BBO Bank Brienz Oberhasli (Brienz, canton of Bern): shares, ETFs and other
// listed products on SIX Swiss Exchange, through BBO E-Banking and its app.
//
// The bank prints no list of what it trades. Its e-banking page says
// "Verfolgen Sie Ihre Anlagen und handeln Sie Wertpapiere bequem von
// unterwegs" and mentions "offenen Börsenaufträge":
//   https://bbobank.ch/de/Info/Zahlungsmittel/BBO_E-Banking
// The «Konditionen Anlegen» sheet prices "Aktien, Warrants, strukturierte
// Produkte und ähnliche Papiere – Abschlüsse in der Schweiz" "inkl. an der
// SIX kotierte Fonds" (minimum CHF 80, or CHF 40 via BBO E-Banking; 1.1 %
// up to CHF 25,000, 50 % off via e-banking), and says "Börsenkotierte Fonds
// gemäss vorstehendem Tarif".
//
// So the catalogue is the whole SIX book, read by brokers/migros/sixBook.mjs:
// Swiss and foreign shares (Sponsored Segment included), ETFs, listed and
// sponsored funds and exchange-traded products, one row per line (ISIN and
// trading currency). No bank page names a segment, board or product it does
// not trade on SIX, so nothing more is removed. The site's offer applies
// "nur für Schweizer Kunden, die in der Schweiz wohnhaft sind": a client
// restriction, not a removal. Left out by the shared module: warrants,
// structured products and bonds (other SIX segments), rights, second trading
// lines, delisted, suspended, dormant and never-traded lines.
//
// Fees: https://bbobank.ch/cmsfiles/dienstleistungen_anlegen.pdf
//
//   node brokers/bbobrienzoberhas/bbobrienzoberhas_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "BBO Bank Brienz Oberhasli",
  out: new URL("bbobrienzoberhas-parsed.json", import.meta.url),
});

// Spar- und Leihkasse Bucheggberg (SLB, Lüterswil, canton of Solothurn):
// shares, ETFs and other listed products on SIX Swiss Exchange, through its
// e-banking and app.
//
// The bank prints no list of what it trades. Its e-banking page offers
// "Wertschriften und Börse: Anlagen verfolgen und Wertpapiere bequem
// unterwegs handeln":
//   https://www.slb.ch/produkte/slb-ebanking-neu/
// its investment page offers "Execution Only (Selbstberatender Kunde)":
//   https://www.slb.ch/privatkunden/anlegen/
// and the fee sheet (valid from 3 March 2026) has a tariff for "Aktien
// Schweizer Franken" (1.10 % up to CHF 25,000, minimum CHF 80) and
// "Aktien Fremdwährung", "20 % Rabatt für Börsentransaktionen via SLB
// e-Banking", and "Strukturierte Produkte / ETF-Fonds / Immobilienfonds:
// Courtagen gemäss Aktientarif".
//
// So the catalogue is the whole SIX book for the "Switzerland" place, read
// by brokers/migros/sixBook.mjs: Swiss and foreign shares (Sponsored
// Segment included), ETFs, listed real estate and sponsored funds and
// exchange-traded products, one row per line (ISIN and trading currency).
// The bank's pages name no exception, so nothing more is removed. Left out
// by the shared module: warrants, structured products and bonds (other SIX
// segments), rights, second trading lines, delisted, suspended, dormant and
// never-traded lines.
//
// Fees: https://www.slb.ch/app/uploads/2026/03/Gebuehren-Tarife-Bereich-Anlagen-aktuell.pdf
//
//   node brokers/sparundleihkassech/sparundleihkassech_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Spar- und Leihkasse Bucheggberg",
  out: new URL("sparundleihkassech-parsed.json", import.meta.url),
});

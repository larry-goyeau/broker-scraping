// What Bank Zimmerberg sells on the exchange, with no login. Its place is
// Switzerland and it prints no list of the titles it trades. The e-banking
// page offers "Direkter Wertschriftenhandel: Kaufen und verkaufen Sie
// Wertschriften schnell und unkompliziert online" ("Aktien & Co kaufen
// oder verkaufen ... Valorensuche nutzen"), and the investment-business
// information says that with Execution Only ("Selbstbedienung") the client
// has "Beteiligungspapiere (z.B. Aktien)", "Anteile an kollektiven
// Kapitalanlagen (Fonds)", structured products and derivatives. The price
// list has one tariff for "Aktien, ETF, strukturierte Produkte, Derivate",
// "In der Schweiz gehandelt" (1.00 % up to CHF 50,000, minimum CHF 80)
// and "Im Ausland gehandelt", with "Rabatt von 50%" on e-banking orders
// placed without advice. So the book is the whole SIX Swiss Exchange book:
// shares, ETFs, ETNs/ETCs and listed funds, one row per line, in the line's
// trading currency.
//
// No bank page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.bankzimmerberg.ch/digital-banking/e-banking/
//   https://www.bankzimmerberg.ch/app/uploads/2025/06/Informationen-ueber-das-Anlagegeschaeft-der-BANK-ZIMMERBERG-AG.pdf
//   Fees: https://www.bankzimmerberg.ch/app/uploads/2025/06/Konditionen-im-Anlagegeschaeft_gueltig-ab-1.4.24.pdf
//
//   node brokers/zimmerberg/zimmerberg_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Bank Zimmerberg",
  out: new URL("zimmerberg-parsed.json", import.meta.url),
});

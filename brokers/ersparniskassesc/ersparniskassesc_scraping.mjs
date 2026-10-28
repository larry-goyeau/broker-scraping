// What Ersparniskasse Schaffhausen sells on the exchange, with no login.
// Its place is Switzerland and it prints no list of the titles it trades.
// The e-banking page lists "Wertschriftenhandel: Kauf/Verkauf,
// Auftragsübersicht, Valorensuche", and the Solo (no advice) factsheet
// says "Sie sind unabhängig in Ihren Anlageentscheiden und in der
// Titelselektion". The price list has one tariff for "Aktien,
// Optionsscheine, ETF und ähnliche Papiere", "In der Schweiz gehandelt"
// (1.10 % up to CHF 50,000, minimum CHF 80) and "Im Ausland gehandelt",
// with "Courtagerabatt von 50 %" on orders the client enters in e-banking.
// So the book is the whole SIX Swiss Exchange book: shares, ETFs,
// ETNs/ETCs and listed funds, one row per line, in the line's trading
// currency.
//
// No bank page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.ersparniskasse.ch/de/e-banking
//   https://www.ersparniskasse.ch/de/privatkunden/anlegen/anlegen-ohne-beratung
//   https://www.ersparniskasse.ch/documents/d/eks/eksh_fs_anlegen_solo
//   Fees: https://www.ersparniskasse.ch/documents/d/eks/eksh_broschuere_a5_anlagegeschaeft_konditionen
//
//   node brokers/ersparniskassesc/ersparniskassesc_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Ersparniskasse Schaffhausen",
  out: new URL("ersparniskassesc-parsed.json", import.meta.url),
});

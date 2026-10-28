// What Nidwaldner Kantonalbank (NKB) sells on the exchange, with no login.
// Its place is the SIX Swiss Exchange and it prints no list of the titles it
// trades: with «DEPOT Direkt» "Sie geben Börsenaufträge selbstständig in
// Auftrag", and the mobile app lets you "direkt in der App Wertschriften
// kaufen oder verkaufen". The price list ("Preise im Anlagegeschäft", 15
// June 2026) charges a "Ticket-Fee (Pauschalgebühr pro Transaktion)" of
// 100 CHF up to 25,000, "online 30 % Rabatt", and passes on the "Börsengebühr
// SIX Swiss Exchange" for the "Swiss Blue Chip Segment", "übrige Aktien" and
// "ETF's und Anlagefonds". So the book is the whole SIX Swiss Exchange book:
// shares, ETFs, ETNs/ETCs and listed funds, one row per line, in the line's
// trading currency.
//
// No NKB page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.nkb.ch/depotdirekt
//   https://www.nkb.ch/mobilebanking
//   Fees: https://nkb.ch/sites/default/files/media/document/Anlagegeschaeft_Preise_15_06_2026_2.pdf
//
//   node brokers/nidwaldnerkanton/nidwaldnerkanton_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Nidwaldner Kantonalbank",
  out: new URL("nidwaldnerkanton-parsed.json", import.meta.url),
});

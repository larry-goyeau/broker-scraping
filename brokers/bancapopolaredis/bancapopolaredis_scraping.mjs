// What Banca Popolare di Sondrio (Suisse) sells on the exchange, with no
// login. Its place is Switzerland and it prints no list of the titles it
// trades. The Trading online page (GoBanking) lets Execution Only and
// advisory clients "acquistare/vendere azioni, obbligazioni, warrants,
// prodotti strutturati, fondi di investimento e ETF", "CHF 40.-- per
// singola operazione". The investment price list prints the same online
// commission ("CHF 40.-- per singola operazione", plus "tassa federale di
// negoziazione, imposte e spese di terzi") and, for orders given to the
// bank, a tariff for "Azioni CH" and "Altre azioni e ETF". So the book is
// the whole SIX Swiss Exchange book: shares, ETFs, ETNs/ETCs and listed
// funds, one row per line, in the line's trading currency.
//
// No bank page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.bps-suisse.ch/trading_online.shtml
//   https://www.bps-suisse.ch/en/trading_online.shtml
//   Fees: https://www.bps-suisse.ch/pdf/bpsDoc_tariffario_prodotti_servizi_investimento_1.pdf
//
//   node brokers/bancapopolaredis/bancapopolaredis_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Banca Popolare di Sondrio (Suisse)",
  out: new URL("bancapopolaredis-parsed.json", import.meta.url),
});

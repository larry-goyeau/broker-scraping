// What Al-Tijari Financial Brokerage (CBK Brokerage, of the Commercial Bank
// of Kuwait) sells in shares, with no login. Al-Tijari deals on Boursa
// Kuwait: its trading fees page is the "Kuwait Stock Exchange Commission and
// Trading fees list" and prices the "PREMIER MARKET", "MAIN MARKET" and
// "REITs MARKET" of the "Listed Stock Market", besides the OTC market. Its
// services, trading information and FAQ pages name no segment, sector or
// foreign line that it does not deal in, so the book is every share that
// trades on Boursa Kuwait today, and KFH Capital REIT (BAITAKREIT), the one
// line of the REIT market, is kept, as a STOCK.
//
// Boursa Kuwait lists no ETF. Suspended companies (MASAKEN on 2026-10-25)
// and delisted ones are left out. The OTC market ("trading services on
// listed and unlisted shares") is not an exchange and is not written; nor
// are buy-in board lines, rights issues, bonds and sukuk. The list, the
// suspended and delisted tables and their checks are
// brokers/kfic/boursaKuwaitBook.mjs.
//
//   https://www.tijarifb.com/en/services/trading-fees (fees)
//   https://www.tijarifb.com/en/services/our-Services
//   https://www.tijarifb.com/en/services/Trading-Information
//   https://www.tijarifb.com/en/faqs
//
//   node brokers/altijari/altijari_scraping.mjs

import { writeBoursaKuwaitCatalogue } from "../kfic/boursaKuwaitBook.mjs";

await writeBoursaKuwaitCatalogue(import.meta.url, "altijari-parsed.json", { reits: true });

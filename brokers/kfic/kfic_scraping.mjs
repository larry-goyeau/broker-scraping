// What KFIC Financial Brokerage sells in shares, with no login. KFIC deals
// on Boursa Kuwait alone: its business page offers "Direct trading on Boursa
// Kuwait" and prints the commission of the "Premier Market", "Main Market"
// and "Auction Market" boards, with access to "all listed securities". It
// names no segment, sector or foreign line that it does not deal in, so the
// book is every share that trades on Boursa Kuwait today.
//
// The commission sheet also prices REIT trading (Arabic line: trading in
// real estate funds "REITS 0.10%", minimum 250 fils), so KFH Capital REIT
// (BAITAKREIT), the one line of Boursa's REIT market, is kept, as a STOCK.
// The Auction Market of the sheet holds no line today. Boursa Kuwait lists
// no ETF. Suspended companies (MASAKEN on 2026-10-25) and delisted ones are
// left out; buy-in board lines, rights issues, bonds and sukuk and the OTC
// platform are not shares of the board. The list, the suspended and
// delisted tables and their checks are brokers/kfic/boursaKuwaitBook.mjs.
//
//   https://www.kficbrokerage.com/en/our-business/
//   https://www.kficbrokerage.com/media/3tic4wuz/boursakuwaitcommission.pdf (fees)
//
//   node brokers/kfic/kfic_scraping.mjs

import { writeBoursaKuwaitCatalogue } from "./boursaKuwaitBook.mjs";

await writeBoursaKuwaitCatalogue(import.meta.url, "kfic-parsed.json", { reits: true });

// What Kingdom Securities sells online in shares and exchange-traded
// funds, with no login. Kingdom Securities Limited (KSL), the stockbroking
// arm of Co-operative Bank of Kenya, is a Nairobi Securities Exchange
// member. It is one of the six brokers offered in Dosikaa, the NSE's
// retail app: the client picks it under "Activate Trading", gives a Kenya
// Revenue Authority PIN, and the app opens a CDS account with KSL; orders
// are then placed by the client in the app.
// KSL also has its own self-service channels, the KSL Trader app and the
// TradeWeb online share trading platform (trading.kingdomsecurities.co.ke),
// for NSE shares. KSL names no other exchange. Its fees are in
// its Terms and Conditions (section 6, "Fees and Charges", with a fee
// table for equities, bonds and derivatives).
// So the book is the NSE board, as read by ../abccapital/nseke.mjs:
// shares, preference shares, REITs and ETFs, without rights, suspended or
// stale codes and the restricted LAPR; ALP and TRFC trade in US dollars.
//
//   https://kingdomsecurities.co.ke/what-we-do/
//   https://kingdomsecurities.co.ke/faqs/
//   http://kingdomsecurities.co.ke/wp-content/uploads/2021/09/KSL-TERMS-AND-CONDITIONS.pdf
//   https://kingdomsecurities.co.ke/wp-content/uploads/2026/07/ONLINE-SHARE-TRADING-FAQs-1.pdf
//   https://trading.kingdomsecurities.co.ke/tradeweb/
//   (NSE board sources: see ../abccapital/nseke.mjs)
//
//   node brokers/kingdomsecurities/kingdomsecurities_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { readNseBoard, nseSummary } from "../abccapital/nseke.mjs";
import fs from "node:fs";

const board = await readNseBoard();
fs.writeFileSync(new URL("kingdomsecurities-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(board.rows)), null, 2));
console.error(nseSummary(board));

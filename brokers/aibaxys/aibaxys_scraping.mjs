// What AIB-AXYS Africa sells online in shares and exchange-traded funds,
// with no login. AIB-AXYS Africa (formerly Axys Investment Bank) is a
// Nairobi Securities Exchange member. It is one of the six brokers offered
// in Dosikaa, the NSE's retail app: the client picks it under "Activate
// Trading", gives a Kenya Revenue Authority PIN, and the app opens a CDS
// account with AIB-AXYS; orders are then placed by the client in the app.
// AIB-AXYS also has its own self-service channels, the AIB DigiTrader app
// and the ActiveTrader web platform, both for "local stocks" on the NSE.
// Its fee tariff (Downloads page, "AIB-AXYS FEE TARIFF", Fee Tariff 2024)
// has an "Online and Mobile Trading" column for NSE shares.
// Its Global Markets page offers NYSE, Nasdaq, LSE and HKEX shares, but
// orders go "through our team" (email or account manager), and to "Is it
// available on our digital platforms?" it answers "We are working on
// providing this to our digital platform". Those places are not bought
// online, so they stay out. Bonds and derivatives are not shares or ETFs.
// So the book is the NSE board, as read by ../abccapital/nseke.mjs:
// shares, preference shares, REITs and ETFs, without rights, suspended or
// stale codes and the restricted LAPR; ALP and TRFC trade in US dollars.
//
//   https://ww2.aib-axysafrica.com/trading
//   https://ww2.aib-axysafrica.com/aibdigitrader
//   https://ww2.aib-axysafrica.com/global-markets
//   https://ww2.aib-axysafrica.com/downloads
//   https://ww2.aib-axysafrica.com/_files/ugd/af94b6_1bd1a2fa6c9e403cac4ffe5e561c58f0.pdf
//   https://aibaxys.kenyaonlinetrading.com/ActiveTrader/
//   (NSE board sources: see ../abccapital/nseke.mjs)
//
//   node brokers/aibaxys/aibaxys_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { readNseBoard, nseSummary } from "../abccapital/nseke.mjs";
import fs from "node:fs";

const board = await readNseBoard();
fs.writeFileSync(new URL("aibaxys-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(board.rows)), null, 2));
console.error(nseSummary(board));

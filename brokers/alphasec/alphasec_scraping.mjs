// Alpha Securities Corporation (Manila, PSE member since 1989) sells online
// on one place, the Philippine Stock Exchange, through its PSETradex
// platform (alpha.psetradex.ph). Its "Frequently Asked Questions" PDF, the
// broker's own document, opens an online account to "Any person of legal
// age and of any nationality" and prices each "executed transaction for on
// line trading": "Commission - Minimum of .0025 or Php20.00 whichever is
// higher", plus VAT on the commission, the SCCP fee (.01%), the PSE fee
// (.005%) and the sales tax on a sale. It prints no list and names no
// board, product or security it leaves out, so the catalogue is every open
// PSE line, ETFs, REITs and dollar lines included.
//
// alpha.psetradex.ph itself now answers with a blank PSETradex page, but the
// PDF is still served there; its certificate has expired, so the PDF is read
// with certificate checks off (../alphasec/pdfSays.mjs). The run stops when
// the online-trading and commission sentences are gone.
//
//   https://alpha.psetradex.ph/wp-content/themes/Alpha%20Bootstrap/pdf/FREQUENTLY%20ASKED%20%20QUESTIONS-final.pdf
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
// Fees: "Commission - Minimum of .0025 or Php20.00 whichever is higher"
// (online trading, same FAQ PDF).
//
//   node brokers/alphasec/alphasec_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";
import { pdfSays } from "./pdfSays.mjs";

await pdfSays(
  "https://alpha.psetradex.ph/wp-content/themes/Alpha%20Bootstrap/pdf/FREQUENTLY%20ASKED%20%20QUESTIONS-final.pdf",
  [
    /can open an online trading account with Alpha Securities/i,
    /Commission - Minimum of \.0025 or Php ?20 ?\.00 whichever is higher/,
    /HOW TO USE ALPHA SECURITIES ONLINE TRADING PLATFORM/,
  ]
);

const rows = await writePseCatalogue(import.meta.url, "alphasec-parsed.json", { mic: "XPHS" });
if (rows.length < 250) throw new Error(`only ${rows.length} PSE rows`);

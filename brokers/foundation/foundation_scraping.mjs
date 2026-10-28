// What Foundation Securities (Foundation EDGE) sells in shares and ETFs,
// with no login. Its online accounts, Edge Value ("A self-directed
// account") and Edge Prime, trade the Pakistan Stock Exchange ready market
// through the Foundation EDGE terminal, web portal and app. The Pakistan
// Stock Exchange is the only place (PMEX commodities: out).
//
//   https://www.fsedge.com/products.php
//   https://www.fsedge.com/faqs.php
//
// Foundation publishes no symbol list and its Edge Value and Edge Prime
// pages name no board, segment or ETF they do not trade, so the catalogue
// is the exchange's whole book: the PSX regular deliverable market (REG),
// read by brokers/nextcapital/psxBook.mjs (sources and filters there):
//
//   https://dps.psx.com.pk/eligible-scrips
//   https://dps.psx.com.pk/data/eligible-scrips/REG.xml
//
// Kept: shares, preference shares, modarabas, REITs and the PSX ETFs, in
// rupees on XKAR.
// Left out (psxBook): rights, closed-end funds, debt lines, and companies
// the exchange prints as delisted or suspended or that have not traded
// for six months (psxStatus.mjs).
// Not applied: "Foundation Shariah Edge", "An exclusive product for
// Shariah compliant stocks of KMI ALL PSX index", is a separate account a
// client chooses; it does not narrow Edge Value. The FAQ's "Short Sell
// orders for regular market are not allowed" is an order type, not a line.
// Remarks, not removals: GEM Board lines (accredited investors only) and
// lines on the non-compliant counter, as psxBook sets them.
//
// Fee page ("For EDGE Stock Trading Commission Slab", read on 2026-10-25):
// Edge Value, price 0.01 - 1.99 "3 Paisa", 2.00 and above "3 Paisa or
// 0.15% Whichever is higher"; Edge Prime "5 Paisa or 0.17%".
//
//   https://www.fsedge.com/fee.php
//
//   node brokers/foundation/foundation_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("foundation-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Foundation Securities: ${psxBookSummary(rows)}`);

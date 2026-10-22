// What Faida Investment Bank sells online in shares and exchange-traded
// funds, with no login. Faida Investment Bank (FIB) is a Nairobi
// Securities Exchange member. It is one of the six brokers offered in
// Dosikaa, the NSE's retail app: the client picks it under "Activate
// Trading", gives a Kenya Revenue Authority PIN, and the app opens a CDS
// account with Faida; orders are then placed by the client in the app.
// Faida also has its own self-service channels, the Faida M-Trader app and
// the ActiveTrader web platform (faida.kenyaonlinetrading.com), for NSE
// shares. Its trading fees are on its FAQ page ("What are the charges of
// trading?"). fib.co.ke did not answer on 2026-10-22; the FAQ and Online
// Trading pages were read in the Wayback Machine copies of 12 Oct 2026 and
// 22 Apr 2026.
// Faida has worked on Rwanda Stock Exchange deals (the I&M Bank Rwanda
// rights issue), and the RSE seat is held by a separate company, Faida
// Securities Rwanda (rse.rw/stockbrokers). Faida Investment Bank publishes
// no online, self-service way to buy RSE shares from the Kenyan account,
// no RSE tariff and no list of them, so the RSE stays out.
// So the book is the NSE board, as read by ../abccapital/nseke.mjs:
// shares, preference shares, REITs and ETFs, without rights, suspended or
// stale codes and the restricted LAPR; ALP and TRFC trade in US dollars.
//
//   https://fib.co.ke/faqs/
//   https://fib.co.ke/online-trading/
//   https://web.archive.org/web/20261012143757/https://fib.co.ke/faqs/
//   https://web.archive.org/web/20260422181421/https://fib.co.ke/online-trading/
//   https://faida.kenyaonlinetrading.com/ActiveTrader/
//   (NSE board sources: see ../abccapital/nseke.mjs)
//
//   node brokers/faida/faida_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { readNseBoard, nseSummary } from "../abccapital/nseke.mjs";
import fs from "node:fs";

const board = await readNseBoard();
fs.writeFileSync(new URL("faida-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(board.rows)), null, 2));
console.error(nseSummary(board));

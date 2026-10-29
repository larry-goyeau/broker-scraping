// What Aba Ali Habib Securities sells in shares and ETFs, with no login.
// Its accounts trade the Pakistan Stock Exchange online ("Online Trading",
// "Our App", KITS trading interface). The Pakistan Stock Exchange is the
// only place (PMEX commodities: out).
//
//   https://www.abaalihabib.com/
//   https://www.abaalihabib.com/uploads/files/education_menu/KITS_Trading_Interface_Manual.pdf
//
// Aba Ali Habib publishes no symbol list and names no board, segment or
// ETF it does not trade, so the catalogue is the exchange's whole book: the
// PSX regular deliverable market (REG),
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
// Remarks, not removals: GEM Board lines (accredited investors only) and
// lines on the non-compliant counter, as psxBook sets them.
//
// Fees: the only equity rates the site prints are in its Roshan Digital
// Account guide, "OUR COMMISSION, CHARGES AND GOVT. TAX DETAIL": price
// 0-19.9999 "0.04 Paisa" (Rs 0.04) a share, 20 and above 0.20%, delivery
// and difference alike; SST 13% of brokerage, NCCPL tariff. The individual
// form's "Annexure E: Commission Slab" carries no figures.
//
//   https://abaalihabib.com/uploads/files/Roshan_Digital_Account_Opening_Detail_Process_(1)(1).pdf
//
//   node brokers/abaalihabib/abaalihabib_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("abaalihabib-parsed.json", import.meta.url);

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Aba Ali Habib Securities: ${psxBookSummary(rows)}`);

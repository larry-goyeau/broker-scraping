// Stocko (SAS Online) publishes its contract file as one public ZIP per
// exchange, with no login.
//
// https://api.stocko.in/api/v1/contract/Compact?info=download&exchanges=NSE
// https://api.stocko.in/api/v1/contract/Compact?info=download&exchanges=BSE
//   Each ZIP holds one CSV (NSECompactScrip.csv, BSECompactScrip.csv), read
//   by ./compact.mjs. The segment column is the NSE series or the BSE group.
//   There is no ISIN; it is joined from the NSE equity list and Upstox.
//   Indices (INDICES, IDX), debt series, BSE InvIT units (IF), NS/NT lines,
//   iNAV lines and rights entitlements are not part of this catalogue. NFO,
//   BFO, CDS and MCX are contracts.
//
//   node brokers/stocko/stocko_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { compactListings, checkFloor } from "./compact.mjs";

const FLOOR = { NSE: 2500, BSE: 3500 };

const listings = await compactListings("api.stocko.in");
const counts = checkFloor(listings, FLOOR);
fs.writeFileSync(new URL("stocko-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${JSON.stringify(counts)}, ${listings.length} listings (${withIsin} with an ISIN)`);

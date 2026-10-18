// Mastertrust publishes the contract file of its trading platform as one
// public ZIP per exchange, with no login. It is the same platform and the
// same Compact layout as Stocko, so ../stocko/compact.mjs reads it.
//
// https://trade.mastertrust.co.in/api/v1/contract/Compact?info=download&exchanges=NSE
// https://trade.mastertrust.co.in/api/v1/contract/Compact?info=download&exchanges=BSE
//   The production host. masterswift-beta.mastertrust.co.in serves the same
//   files. The segment column is the NSE series or the BSE group. There is
//   no ISIN; it is joined from the NSE equity list and Upstox. Indices
//   (INDICES, IDX), debt series, BSE InvIT units (IF), NT lines, iNAV lines
//   and rights entitlements are not part of this catalogue. NFO, BFO, CDS
//   and MCX are contracts.
//
//   node brokers/mastertrust/mastertrust_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { compactListings, checkFloor } from "../stocko/compact.mjs";

const FLOOR = { NSE: 2500, BSE: 3500 };

const listings = await compactListings("trade.mastertrust.co.in");
const counts = checkFloor(listings, FLOOR);
fs.writeFileSync(new URL("mastertrust-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${JSON.stringify(counts)}, ${listings.length} listings (${withIsin} with an ISIN)`);

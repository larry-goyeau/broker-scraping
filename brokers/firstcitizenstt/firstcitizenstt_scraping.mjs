// What First Citizens Brokerage and Advisory Services Limited (First
// Citizens group, Trinidad and Tobago; TTSE member) sells online in shares,
// with no login. Its "TTSE Trading Online Platform" page sells
// self-directed trading on the TTSE's TOP online platform, and its
// brokerage-account page prices local trades. It publishes no list and
// names no board or security type it leaves out.
//
//   https://www.firstcitizensgroup.com/tt/ttse-trading-online-platform/
//   https://www.firstcitizensgroup.com/tt/first-citizens-investment-services/brokerage-account/
//
// So the catalogue is the whole TTSE board, read by
// ../republicwealth/ttseBook.mjs: every Ordinary, Preference, Second Tier,
// SME, Mutual Fund and USD Equity line, less suspended, de-listed and
// never-traded lines; bonds are not read. Currency is the board's (TTD;
// USD on the USD Equity board). broker-list.json names one place, the
// Trinidad and Tobago Stock Exchange. The foreign markets of First
// Citizens' "Global Investment Solutions" (Pershing platform) belong to
// First Citizens Investment Services and are not in broker-list.json.
//
// Fees (brokerage-account page): a commission of 1.25% of trade value plus
// the 0.21% TTSE/TTCD charge:
//   https://www.firstcitizensgroup.com/tt/first-citizens-investment-services/brokerage-account/
//   https://www.firstcitizenstt.com/fcis/our-products/global-investment-solutions/brokerage-account-benefits.html
// firstcitizensgroup.com and firstcitizenstt.com answer 403 to scripts
// (Akamai), so the run checks no page of the broker; the TTSE board read
// stops on its own when the exchange's pages change.
//
//   node brokers/firstcitizenstt/firstcitizenstt_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ttseBook } from "../republicwealth/ttseBook.mjs";

const rows = await ttseBook();
const written = stampRows(withoutObligations(rows));
if (written.length < 25) throw new Error(`only ${written.length} TTSE rows`);
fs.writeFileSync(new URL("firstcitizenstt-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`First Citizens Brokerage (T&T): ${written.length} TTSE rows`);

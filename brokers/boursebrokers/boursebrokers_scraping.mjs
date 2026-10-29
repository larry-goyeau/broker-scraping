// What Bourse Securities Limited ("Bourse Brokers", Trinidad and Tobago;
// TTSE member) sells online in shares, with no login. Its local
// stockbroking FAQ: "An order can be placed with the broker by phone, in
// person, or via e-mail. There is also an online option for Orders
// facilitated by the TTSE. TTSE Online Trading Platform ...". It publishes
// no list and names no board or security type it leaves out.
//
//   https://bourseinvestment.com/individual-solutions/stockbroking/local-stockbroking/
//
// So the catalogue is the whole TTSE board, read by
// ../republicwealth/ttseBook.mjs: every Ordinary, Preference, Second Tier,
// SME, Mutual Fund and USD Equity line, less suspended, de-listed and
// never-traded lines; bonds are not read. Currency is the board's.
//
// Not added: the United States that broker-list.json gives with the
// restriction "By phone/advisor only". The international stockbroking page
// prices US trades (US$8 ticket, 0.5%) but names no online channel for them,
// while the only online option the site names is the TTSE's platform.
//
// Fees (local stockbroking FAQ): "What are the fees/commissions charged for
// trading on the local stock market? 1.50% on the first $50,000 1.25% on
// second $50,000. 1% on remaining market value over $100,000.":
//   https://bourseinvestment.com/individual-solutions/stockbroking/local-stockbroking/
//
//   node brokers/boursebrokers/boursebrokers_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";
import { ttseBook } from "../republicwealth/ttseBook.mjs";

await evidence("https://bourseinvestment.com/individual-solutions/stockbroking/local-stockbroking/", [/1\.50% on the first \$50,000/, /online option for Orders facilitated by the TTSE/]);

const rows = await ttseBook();
const written = stampRows(withoutObligations(rows));
if (written.length < 25) throw new Error(`only ${written.length} TTSE rows`);
fs.writeFileSync(new URL("boursebrokers-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`Bourse Brokers: ${written.length} TTSE rows`);

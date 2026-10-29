// What JMMB Securities (Trinidad and Tobago) sells online in shares and
// ETFs, with no login. Its investment-products page: "Buying and selling
// stocks online is our speciality. JMMB Investments gives you access to
// stocks listed on both the Trinidad and Tobago Stock Exchange (TTSE) and
// the New York Stock Exchange (NYSE) ... if you want to do it yourself, you
// can also buy and sell stocks online, through our Interactive platform
// powered by Interactive Brokers." It publishes no list.
//
//   https://tt.jmmb.com/investment-products
//
// Two places, as in broker-list.json:
// - TTSE: the whole board, read by ../republicwealth/ttseBook.mjs (every
//   Ordinary, Preference, Second Tier, SME, Mutual Fund and USD Equity
//   line, less suspended, de-listed and never-traded lines; bonds not
//   read).
// - New York Stock Exchange: the page names the TTSE and the NYSE as a
//   closed list ("both"), so by the owner's rule the US place keeps the
//   NYSE's own listings only (MIC XNYS) from the whole US exchange book of
//   the day (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds,
//   closed-end funds and the ETFs listed there; warrants, rights, units,
//   when-issued lines, listed notes and halted lines are left out there).
//   Nasdaq, NYSE Arca (where most US ETFs list) and the other exchanges the
//   Interactive Brokers platform reaches are a broker-list question, not
//   added here. OTC is not named.
//
// Fees (equities page): "The trading fee structure comprises of two parts,
// a fixed portion ($25 ticket charge) and a variable portion (7.5 cents per
// share)"; "Minimum account size: US $100,000.00". No page prices TTSE
// orders on their own:
//   https://tt.jmmb.com/equities
//
//   node brokers/jmmbsecuritiestt/jmmbsecuritiestt_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";
import { ttseBook } from "../republicwealth/ttseBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await evidence("https://tt.jmmb.com/investment-products", [/Trinidad and Tobago Stock Exchange \(TTSE\) and the New York Stock Exchange \(NYSE\)/, /powered by Interactive Brokers/]);
await evidence("https://tt.jmmb.com/equities", [/\$25 ticket charge/, /7\.5 cents per share/]);

const ttse = await ttseBook();
if (ttse.length < 25) throw new Error(`only ${ttse.length} TTSE rows`);
const book = await usBook();
const nyse = withoutObligations([...book]).filter((row) => row.mic === "XNYS");
if (nyse.length < 2000) throw new Error(`only ${nyse.length} NYSE rows`);

const rows = stampRows(withoutObligations([...ttse, ...nyse]));
fs.writeFileSync(new URL("jmmbsecuritiestt-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`JMMB Securities (T&T): ${rows.length} rows (${ttse.length} TTSE, ${nyse.length} NYSE)`);

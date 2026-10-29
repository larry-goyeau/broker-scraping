// What Alpha RHEINTAL Bank sells to an "Alpha Execution Only" client on
// the Swiss exchange, with no login.
//
// Alpha Execution Only: "Sie können Aufträge zum Kauf oder Verkauf von
// Finanzinstrumenten im Rahmen des berücksichtigten Marktangebots per
// E-Banking oder Mobile Banking erteilen."
//   https://www.alpharheintalbank.ch/private-banking/dienstleistungen/alpha-execution-only/
//   https://www.alpharheintalbank.ch/fileadmin/Uploads/PDF_Produkteblaetter/Alpha_Execution_Only.pdf
// The bank publishes no list of what it sells.
//
// Place: Switzerland, as broker-list.json gives it. No Alpha page names a
// Swiss venue; as for the other Swiss banks whose place is "Switzerland"
// (../migros, ../banquecantonalen), the place is the SIX Swiss Exchange
// book, read by ../migros/sixBook.mjs (shares, ETFs and ETPs, one row per
// ISIN and trading currency, minus rights, second lines, suspended,
// delisted, never-traded and dormant lines; listed funds are dropped by
// stampRows). BX Swiss is not read: no Alpha page names it. Shares and ETFs
// "in den restlichen Währungen" (foreign) are not this broker's place in
// broker-list.json.
//
// Fees: "Leistungs- und Preisübersicht", "Preise Private Banking",
// "Börsentransaktionen (Courtage)": "Aktien und ETF's in CHF ... bis CHF
// 50'000.00 1.10 %", "Minimum CHF 80.00"; "Alpha Execution Only: 50 % auf
// Courtage bei E-Banking".
//   https://www.alpharheintalbank.ch/fileadmin/Uploads/PDF_Produkteblaetter/Alpha_Leistungs_und_Preisuebersicht.pdf
//
//   node brokers/alpharheintalban/alpharheintalban_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.alpharheintalbank.ch/private-banking/dienstleistungen/alpha-execution-only/", [/Execution Only/, /Leistungs- und Preis/]);

const rows = await writeSixCatalogue({
  broker: "Alpha RHEINTAL Bank",
  out: new URL("alpharheintalban-parsed.json", import.meta.url),
});
if (rows.length < 3000) throw new Error(`only ${rows.length} SIX lines`);

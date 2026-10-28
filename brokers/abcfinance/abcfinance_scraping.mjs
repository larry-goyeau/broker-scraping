// What ABC Finance (ИП АВС Финанс АД, Sofia) sells on the Bulgarian Stock
// Exchange, with no login. ABC Finance is a BSE member; its brokerage page
// offers trading on the BSE by phone, e-mail, at the office or online
// through its own platform, with no list of excluded segments or products:
//
//   https://abc-finance.info/uslugi/brokerski-uslugi/
//   "Търговия с ценни книжа на БФБ ... Българските публични компании се
//    котират на БФБ – София. Търговията на БФБ се извършва чрез поръчка
//    ... или директно чрез платформата ни "АВС трейдър"."
//   https://abc-finance.info/za-klienti/produkti/
//   "АВС Финанс" AД предлага търговия с акции при цени в реално време"
//
// The tariff prices trades on the domestic regulated market (the BSE Main
// Market) and on the domestic non-regulated market (the BSE's own MTFs,
// BaSE and BEAM), so both are in:
//   https://abc-finance.info/za-klienti/tarifa/
//   https://abc-finance.info/wp-content/uploads/tarifa_abc-finans_22-11-2021eur.xlsx
//   "Сделки на регулиран пазар на ценни книжа н страната" 1.8% / 1.4% / 1%
//    of the trade by order size, minimum 10 лв./5.11 EUR;
//   "Сделки на нерегулиран пазар на ценни книжа в страната" 2%, minimum
//    10 лв./5.11 EUR.
//
// So the catalogue is the whole BSE, read by the shared ./bseBook.mjs:
// every share of the Main Market, BaSE and BEAM (REITs and preference
// shares too) as STOCK, and the fund units of the Exchange Traded Products
// segment (Expat ETFs, Expat Gold, the listed national investment funds)
// as ETF. All on "Bulgarian Stock Exchange", XBUL, in EUR (the euro
// replaced the lev on 1 January 2026).
//
// Left out:
//   - bonds, government securities, compensatory instruments, warrants and
//     rights (not shares or exchange-traded products);
//   - lines in liquidation, bankruptcy or insolvency, lines under a BSE
//     suspension or removal notice, and lines with no trade in the last year
//     (see ./bseBook.mjs);
//   - BSE International (foreign shares, ETFs, ETNs, ETCs on the BSE's MTF):
//     nothing on ABC Finance's pages or tariff mentions it or foreign
//     securities, so it is not read.
//
// Fees: https://abc-finance.info/wp-content/uploads/tarifa_abc-finans_22-11-2021eur.xlsx
//
// Run from the repo root:
//   node brokers/abcfinance/abcfinance_scraping.mjs

import { writeBseCatalogue } from "./bseBook.mjs";

await writeBseCatalogue(import.meta.url, "abcfinance-parsed.json");

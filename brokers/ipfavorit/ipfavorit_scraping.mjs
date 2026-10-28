// What IP Favorit (ИП Фаворит АД, Sofia) sells on the Bulgarian Stock
// Exchange, with no login. IP Favorit is a BSE member and offers online
// trading on the BSE through the COBOS platform, with no list of excluded
// segments or products:
//
//   https://ipfavorit.com/online-търговия-на-бфб/
//   ""ИП ФАВОРИТ" АД предлага на своите клиенти онлайн търговия на
//    Българска Фондова Борса чрез системата COBOS"
//   https://ipfavorit.com/en/online-rading-on-bulgarian-stock-exchange/
//   https://ipfavorit.com/услуги/
//   "посредничи при сключване на сделки с ценни книжа, регистрирани на
//    регулиран пазар ("БФБ – София" АД)"
//
// So the catalogue is the whole BSE, read by the shared
// ../abcfinance/bseBook.mjs: every share of the Main Market, BaSE and BEAM
// (REITs and preference shares too) as STOCK, and the fund units of the
// Exchange Traded Products segment (Expat ETFs, Expat Gold, the listed
// national investment funds) as ETF. COBOS is the BSE's own remote-access
// order system, so an order reaches any segment of the BSE's T7 book. All
// rows are on "Bulgarian Stock Exchange", XBUL, in EUR (the euro replaced
// the lev on 1 January 2026).
//
// Left out:
//   - bonds, government securities, compensatory instruments, warrants and
//     rights (not shares or exchange-traded products; the tariff prices
//     bonds and compensatory instruments, but they are out as everywhere);
//   - lines in liquidation, bankruptcy or insolvency, lines under a BSE
//     suspension or removal notice, and lines with no trade in the last year
//     (see ../abcfinance/bseBook.mjs);
//   - BSE International (foreign shares, ETFs, ETNs, ETCs on the BSE's MTF):
//     nothing on IP Favorit's pages mentions it or foreign securities, so it
//     is not read.
//
// Fees (same page): "За сделки с акции и компенсаторни инструменти
// комисионна от 0,5% от стойността на сделката, но не по-малко от 3 лев
// (вкл. таксите на БФБ и ЦД)", no annual fee.
//   https://ipfavorit.com/online-%d1%82%d1%8a%d1%80%d0%b3%d0%be%d0%b2%d0%b8%d1%8f-%d0%bd%d0%b0-%d0%b1%d1%84%d0%b1/
//
// Run from the repo root:
//   node brokers/ipfavorit/ipfavorit_scraping.mjs

import { writeBseCatalogue } from "../abcfinance/bseBook.mjs";

await writeBseCatalogue(import.meta.url, "ipfavorit-parsed.json");

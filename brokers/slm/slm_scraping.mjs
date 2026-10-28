// Bank SLM (Spar + Leihkasse Münsingen, canton of Bern): shares, ETFs and
// other listed products on SIX Swiss Exchange, through its e-banking, its
// mobile app or the "Börsentelefon".
//
// The bank prints no list of what it trades. Its app page says clients can
// "Börsenaufträge erteilen":
//   https://bankslm.ch/services/digital-banking/e-banking-mobile-banking-app/
// and its price brochure has one domestic and one foreign tariff for
// "Aktien, kotierte Anlagefonds und ETF, strukturierte Produkte, Eurex
// Optionen, Warrants" (Inland: 0.90 % up to CHF 25,000, minimum CHF 80),
// with "Aufträge via SLM E-Banking: 50% Rabatt". The execution-only
// clients "führen die Transaktionen via E-Banking aus oder geben Ihre
// Aufträge via Börsentelefon zur Ausführung".
//
// So the catalogue is the whole SIX book for the "Switzerland" place, read
// by brokers/migros/sixBook.mjs: Swiss and foreign shares (Sponsored
// Segment included), ETFs, listed and sponsored funds ("kotierte
// Anlagefonds") and exchange-traded products, one row per line (ISIN and
// trading currency). The bank's pages name no exception, so nothing more
// is removed. Left out by the shared module: warrants, structured products
// and bonds (other SIX segments; warrants are out as in every catalogue),
// rights, second trading lines, delisted, suspended, dormant and
// never-traded lines.
//
// Fees: https://bankslm.ch/app/uploads/2018/01/Broschuere-Preise-Dienstleistungen.pdf
// (valid from 1 January 2026, page 14 "Courtage")
//
//   node brokers/slm/slm_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Bank SLM",
  out: new URL("slm-parsed.json", import.meta.url),
});

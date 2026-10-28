// What Option Securities (Option Securities S.A., AN y ALyC Propio n° 147
// CNV) sells in shares and exchange-traded funds, with no login. It
// publishes no list. Its home page names the local board and a US account
// opened through it, both online:
//
//   https://www.optionsecurities.com.ar/
//   "BROKERAGE ... acceso a los distintos instrumentos del mercado de
//   capitales argentino. Cedears / Cedears ETF (S&P 500 y Nasdaq) /
//   Acciones / ..."
//   "CUENTA EN USA: Abrí tu cuenta en USA y operá directamente en
//   Wallstreet a través nuestro de forma 100% online. Accede a todos los
//   instrumentos que ofrece el mercado americano, como es el caso de los
//   principales índices y fondos comunes de inversión."
//   https://www.optionsecurities.com.ar/brokerage
//   "vas a poder operar a través de nuestras plataformas digitales"
//
// Buenos Aires: BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C)
// lines of every local share and CEDEAR that BYMA quotes and that trades.
// "Cedears ETF (S&P 500 y Nasdaq)" is read as what ETF certificates are
// (SPY, QQQ), not as a limit: the same list names "Cedears" whole, and no
// page says other ETF certificates are refused; they are kept. Cable lines
// are kept: the client's US account holds dollars abroad. Block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out by the shared module.
//
// United States: "todos los instrumentos que ofrece el mercado americano",
// no exchange named and no exception, so the whole US exchange book of the
// day (../wellstrade/usBook.mjs): shares, ADRs, REITs, preferreds,
// closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE
// Arca, Cboe BZX and the Texas exchanges, less open trade halts, warrants,
// rights, units, when-issued lines and listed notes. OTC lines are not
// added. One row per title, in dollars.
//
// Fees ("Comisiones", linked from the home page): "Acciones, CEDEARs,
// Bonos Opciones y Ejercicios 0,30% 1,00%" (minimum and maximum). No line
// names the US account's trades:
//   https://www.optionsecurities.com.ar/Listado-de-comisiones.pdf
//
//   node brokers/optionsecurities/optionsecurities_scraping.mjs

import { bymaUs, evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.optionsecurities.com.ar/", [
  /Cedears ETF \(S&P 500 y Nasdaq\)/,
  /todos los instrumentos que ofrece el mercado americano/i,
  /100% online/i,
  /Listado-de-comisiones\.pdf/,
]);
await evidence("https://www.optionsecurities.com.ar/brokerage", [/plataformas digitales/i]);
await pdf("https://www.optionsecurities.com.ar/Listado-de-comisiones.pdf");

await bymaUs("Option Securities", new URL("optionsecurities-parsed.json", import.meta.url), { cable: true });

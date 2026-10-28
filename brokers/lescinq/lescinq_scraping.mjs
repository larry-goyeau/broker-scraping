// What Les Cinq Capital (Les Cinq Capital S.A., ALyC Integral n° 2305 CNV,
// BYMA member n° 854) sells in shares and exchange-traded funds, with no
// login. It publishes no list. Its home page says, for each place:
//
//   https://www.cinqcapital.com/
//   Renta Variable: "Operamos acciones del panel general y líder de BYMA."
//   CEDEARs: "Más de 300 empresas internacionales desde Argentina, en pesos
//   o dólares." (examples AAPL, GOOGL, MSFT, AMZN, SPY, QQQ, NVDA, TSLA,
//   EWZ, GLD)
//   "Local e internacional Argentina & NYSE"; "NYSE Vía Interactive
//   Brokers"; "Dólar MEP / CCL ... Dólar MEP Contado con Liqui".
//
// Buenos Aires shares: BYMA's leader and general panels, whole, read by
// ../bancogalicia/bymaBook.mjs (those two panels are the module's local
// share board): peso, MEP dollar (D) and cable (C) lines of every share that
// BYMA quotes and that trades. Cable lines are kept: the broker buys and
// sells "Contado con Liqui" and its tariff charges a "Transferencia USD
// Cable".
//
// CEDEARs: a stated number, so by the owner's rule the 300 most traded
// CEDEAR titles of BYMA's board (./cedearTop.mjs: the peso line's
// traded value over 90 days), each with its peso, MEP and cable lines. ETF
// certificates (SPY, QQQ, EWZ, GLD) are among them.
//
// New York: the place the page names is the New York Stock Exchange, so by
// the owner's rule only NYSE's own listings are kept: every share, ADR,
// REIT, preferred, closed-end fund and ETF listed on NYSE (MIC XNYS) in the
// US exchange book of the day (../wellstrade/usBook.mjs, less open trade
// halts, warrants, rights, units, when-issued lines and listed notes). No
// page names an exception. Nasdaq, NYSE Arca, NYSE American and Cboe lines
// are not written. broker-list.json names BYMA and the New York Stock
// Exchange, as here.
//
// Fees ("Aranceles y Comisiones", linked as "Cargos y Comisiones" from the
// home page): "Operaciones al contado (Compra/Venta) Acciones - Cedears
// Hasta 1.5%"; no line names foreign shares, which the NYSE orders pass
// through Interactive Brokers:
//   https://cinqcapital.com/Tarifario_CINQ.pdf
//
//   node brokers/lescinq/lescinq_scraping.mjs

import { bymaUs, evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.cinqcapital.com/", [
  /Operamos acciones del panel general y líder de BYMA/i,
  /Más de 300 empresas internacionales/i,
  /NYSE\s*Vía Interactive Brokers/i,
  /Contado con Liqui/i,
  /Tarifario_CINQ\.pdf/,
]);
await pdf("https://cinqcapital.com/Tarifario_CINQ.pdf");

await bymaUs("Les Cinq Capital", new URL("lescinq-parsed.json", import.meta.url), {
  cable: true,
  mics: ["XNYS"],
  cedearTop: 300,
});

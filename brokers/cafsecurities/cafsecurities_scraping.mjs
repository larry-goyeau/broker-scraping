// What CAF Securities Argentina (Securities CAF Argentina S.A., ALyC y AN
// Propio n° 643 CNV; BYMA n° 254, MAV n° 587, ROFEX n° 372) sells in shares
// and exchange-traded funds, with no login. It publishes no list. Its home
// page offers its online trading platform and names the markets it trades:
//
//   https://cafsecurities.com.ar/
//   "nuestros clientes acceden a la mayor variedad de productos a través de
//   nuestra plataforma de trading online"; "Mercados en los que operamos:
//   MAV BYMA ROFEX NYSE NASDAQ".
//
// Buenos Aires: BYMA's whole share and CEDEAR board (CEDEARs of US ETFs
// included), read by ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D)
// and cable (C) lines of every local share and CEDEAR that BYMA quotes and
// that trades. Cable lines are kept: the broker trades NYSE and Nasdaq for
// its clients, so their dollars are held abroad. Block lines, closed-end
// funds, bond CEDEARs, rights, warrants and dormant or delisted lines are
// left out by the shared module. MAV has no share board of its own in open
// data; its shares are the BYMA-listed ones, so no MAV row is written.
//
// United States: the page names NYSE and NASDAQ and no other US exchange,
// so by the owner's rule only their listings are kept: the US exchange book
// of the day (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds,
// closed-end funds, ETFs and ETNs, less open trade halts, warrants, rights,
// units, when-issued lines and listed notes) on NYSE (XNYS) and Nasdaq
// (XNAS). NYSE Arca, NYSE American, Cboe BZX, Texas and IEX lines are not
// written. No page names an exception. One row per title, in dollars.
// broker-list.json names BYMA, NYSE and Nasdaq, as here.
//
// Fees ("Tabla de comisiones máximas", the "Comisiones" link of the home
// page, June 2018): "CONTADO Privados de $0 a $50 3%" (minimum and maximum
// per trade, plus IVA):
//   https://cafsecurities.com.ar/wp-content/uploads/2018/06/honorarios.pdf
//
//   node brokers/cafsecurities/cafsecurities_scraping.mjs

import { bymaUs, evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://cafsecurities.com.ar/", [
  /plataforma de trading online/i,
  /MAV\s*BYMA\s*ROFEX\s*NYSE\s*NASDAQ/,
  /2018\/06\/honorarios\.pdf/,
]);
await pdf("https://cafsecurities.com.ar/wp-content/uploads/2018/06/honorarios.pdf");

await bymaUs("CAF Securities Argentina", new URL("cafsecurities-parsed.json", import.meta.url), {
  cable: true,
  mics: ["XNYS", "XNAS"],
});

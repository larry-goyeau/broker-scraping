// What Argentina Valores (Argentina Valores S.A., ALyC y AN Integral n° 156
// CNV; BYMA agent n° 37, MAV n° 427) sells in shares and exchange-traded
// funds, with no login. It publishes no list. Its products page names local
// shares and Wall Street assets from the same account, traded online:
//
//   https://www.avsa.com.ar/productos-y-servicios/
//   "Operatoria online: Opere en Bolsa a través de nuestra plataforma de
//   Trading Online en los distintos mercados."
//   "Acciones: Empresas que cotizan en Argentina"
//   "Activos de Wall Street: Invierta directamente en acciones, títulos
//   corporativos, derivados, y fondos de Wall Street en dólares y sin
//   necesidad de abrir otra cuenta."
//
// Buenos Aires: BYMA's whole share and CEDEAR board (CEDEARs are companies
// quoted in Argentina; CEDEARs of US ETFs included), read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C) lines
// of every local share and CEDEAR that BYMA quotes and that trades. Cable
// lines are kept: the same account holds Wall Street assets "en dólares",
// abroad, and the tariff moves securities "desde y hacia el exterior (fuera
// de Argentina)". Block lines, closed-end funds, bond CEDEARs, rights,
// warrants and dormant or delisted lines are left out by the shared module.
//
// United States: no exchange is named and no exception, so the whole US
// exchange book of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas exchanges, less open trade
// halts, warrants, rights, units, when-issued lines and listed notes. OTC
// lines are not added: no page names them. The US is one NBBO market: one
// row per title, in dollars.
//
// broker-list.json also names the Mercado Argentino de Valores. MAV has no
// share board of its own in open data and no venue in ../../spreads; its
// shares are the BYMA-listed ones, so no MAV row is written.
//
// Fees (the "Tabla de aranceles" of October 2019, the one the home page
// links): "Acciones - Compra/Venta $ 150 1,25% + $ 100" and "Operaciones
// mercados internacionales U$D 10 1.25% + U$D 10", plus IVA and market fees:
//   https://www.avsa.com.ar/wp-content/uploads/2019/10/AVSA_TABLA-ARANCELES_2019-10.pdf
//
//   node brokers/argentinavalores/argentinavalores_scraping.mjs

import { bymaUs, evidence, pdf } from "../bullmarket/bymaUs.mjs";

const FEES = "https://www.avsa.com.ar/wp-content/uploads/2019/10/AVSA_TABLA-ARANCELES_2019-10.pdf";

await evidence("https://www.avsa.com.ar/productos-y-servicios/", [
  /Empresas que cotizan en Argentina/i,
  /Invierta directamente en acciones, títulos corporativos, derivados, y fondos de Wall Street en dólares/i,
  /plataforma de Trading Online/i,
]);
await evidence("https://www.avsa.com.ar/", [/AVSA_TABLA-ARANCELES_2019-10\.pdf/]);
await pdf(FEES);

await bymaUs("Argentina Valores", new URL("argentinavalores-parsed.json", import.meta.url), { cable: true });

// What Arata S.A. (ALyC y AN Propio n° 185 CNV, BYMA agent n° 36) sells in
// Buenos Aires shares and CEDEARs, with no login. It publishes no list of
// its own; its pages say it trades every capital-markets product, and its
// equity page names local shares, CEDEARs and ETFs:
//
//   https://aratasa.com.ar/
//   "Operamos todos los productos del Mercado de Capitales, local y del
//   exterior"
//   https://aratasa.com.ar/renta-variable
//   "RENTA VARIABLE: Acciones / CEDEARS (Acciones de Mercados externos) /
//   ETF (Fondos que replican índices y que se operan como acciones)."
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso and MEP dollar (D) lines of every
// local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ included)
// that BYMA quotes and that trades. Cable (C) lines are not written: no
// Arata page nor its tariff names cable / CCL settlement or dollars held
// abroad. Block lines, closed-end funds, bond CEDEARs, rights, warrants and
// dormant or delisted lines are left out by the shared module. Bonds,
// options, futures, cauciones, cheques and funds are other products. No page
// names a segment, board or title the broker does not trade.
//
// Fees (tariff PDF, "Renta Variable": "Contado" arancel minimum $100, 0.10%
// to 2.00%; "Servicios de custodia" pass the Caja de Valores cost on;
// account maintenance $100 a month):
//   https://aratasa.com.ar/wp-content/uploads/2023/08/Aranceles-Arata-.-1-1-1.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/arata/arata_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Arata", { cable: false });
fs.writeFileSync(new URL("arata-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Arata: ${rows.length} BYMA lines`);

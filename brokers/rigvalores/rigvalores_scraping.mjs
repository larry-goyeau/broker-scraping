// What RIG Valores (RIG Valores S.A., ALyC y AN Propio n° 122 CNV) sells in
// Buenos Aires shares and CEDEARs, with no login. It publishes no list of
// its own. Its pages name shares among its instruments, and its tariff
// prices local and foreign shares (CEDEARs) alike:
//
//   https://rigvalores.com/operatoria-online/
//   "RIG Valores S.A. te ofrece una amplia variedad de instrumentos
//   financieros: Acciones, Bonos, Letras, Obligaciones Negociables, ..."
//   https://rigvalores.com/preguntas-frecuentes/
//   "¿Puedo invertir en dólares? Sí. Disponemos de instrumentos en pesos y
//   en dólares"
//   Tariff: "Compra/Venta de Acciones" and "Compra/Venta de Acciones
//   Exterior"
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso and MEP dollar (D) lines of every
// local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ included)
// that BYMA quotes and that trades. Cable (C) lines are not written: the
// pages speak of dollar instruments but no page nor the tariff names cable /
// CCL settlement or dollars paid abroad. Block lines, closed-end funds, bond
// CEDEARs, rights, warrants and dormant or delisted lines are left out by
// the shared module. Bonds, letras, ONs, options, futures, cauciones,
// cheques and funds are other products. No page names a segment, board or
// title the broker does not trade.
//
// Fees ("Listado de Aranceles Generales", 2026): "Compra/Venta de Acciones"
// and "Compra/Venta de Acciones Exterior" up to 2%, minimum $500 per trade,
// plus IVA (21%) and market fees; custody up to 2% a year, minimum $500 a
// month:
//   https://rigvalores.com/wp-content/uploads/2026/03/aranceles-ultima.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/rigvalores/rigvalores_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("RIG Valores", { cable: false });
fs.writeFileSync(new URL("rigvalores-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`RIG Valores: ${rows.length} BYMA lines`);

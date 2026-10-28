// What GUOR Investments S.A. (Rosario, ALyC no. 496 at the CNV) sells in
// Buenos Aires shares and CEDEARs, with no login. It publishes no list of
// its own. Its pages, read 2026-10-25:
//
//   https://www.guor.com.ar/Negocios
//   "inversiones en todos los productos disponibles en el país":
//   "Compra/venta de acciones" and "CEDEARs: compra y venta de acciones a
//   nivel internacional ... desde el mercado argentino", next to bonds,
//   options, cheques, cauciones "en pesos o dólares", ONs and futures.
//   https://www.guor.com.ar/
//   "compra y venta de acciones, bonos y otros productos en el mercado
//   argentino"; orders through Matriz OMS (Primary).
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs from BYMA's open data
// (https://open.bymadata.com.ar/): the peso and MEP dollar (D) lines of
// every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable (C) lines are not
// written: no GUOR page nor its tariff names cable / CCL settlement (the
// tariff's "TRANSFERENCIA u$s EMISORA" is a cash transfer). Block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out by the shared module. Bonds, options, cauciones,
// cheques, ONs, trusts and futures are other products. No page names a
// segment, board or title the broker does not trade.
//
// Fees ("Aranceles", in force from 01/06/2026): "CPA/VTA PRIVADOS 1.00 %
// 1.20 % $ 5.000.00" (minimum rate, maximum rate, fixed base); custody
// "Sin Cargo"; account maintenance $5,200:
//   https://www.guor.com.ar/Recursos/Pdf/aranceles.pdf
//
// broker-list.json names one place, Argentina, with no restriction.
//
//   node brokers/guor/guor_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("GUOR Investments", { cable: false });
fs.writeFileSync(new URL("guor-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`GUOR Investments: ${rows.length} BYMA lines`);

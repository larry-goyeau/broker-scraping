// What Aurum Valores S.A. (ALyC y AN Propio, CNV n° 565) sells in Buenos
// Aires shares and CEDEARs, with no login. It publishes no list of its own;
// its products page says it trades listed public and private securities
// and shares on the local market:
//
//   https://aurum.com.ar/productos/
//   "Negociamos títulos públicos y privados que cotizan en la Bolsa de
//   Valores y en mercados locales e internacionales." "RENTA VARIABLE
//   Realizamos la operación de compra y venta de acciones tanto en el
//   mercado local como en mercados internacionales."
//
// broker-list.json names one place for Aurum, BYMA, so only the local
// market is read here. The catalogue is BYMA's whole share and CEDEAR
// board, read by ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and
// cable (C) lines of every local share and CEDEAR (CEDEARs of US ETFs such
// as SPY and QQQ included) that BYMA quotes and that trades. Cable lines are
// kept because Aurum trades the cable dollar and lets clients move dollars
// abroad: the products page offers "COMPRA Y VENTA DE DÓLAR MEP Y CCL" (CCL
// is the cable dollar), and the tariff charges "Transferencia bancaria al
// exterior 50 USD" and "Transferencia de títulos a otra depositante del
// exterior". Block lines, closed-end funds, bond CEDEARs, rights, warrants
// and dormant or delisted lines are left out by the shared module. Bonds,
// ONs, options, futures, cauciones, cheques and funds are other products.
// No page names a segment, board or title the broker does not trade.
//
// Fees ("Comisiones y aranceles", the "Comisiones máximas" link of the site
// footer): "Compra/Venta de Acciones Hasta 1,50% (mín. USD10 + IVA)" per
// operation; custody "0,34 x mil anual":
//   https://aurum.com.ar/wp-content/uploads/2025/11/Cuadro-Tarifario-Aurum-2025-VF-1.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/aurumvalores/aurumvalores_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Aurum Valores", { cable: true });
fs.writeFileSync(new URL("aurumvalores-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Aurum Valores: ${rows.length} BYMA lines`);

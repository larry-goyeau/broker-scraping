// What Bx+ (Casa de Bolsa Ve por Más) sells in shares and exchange-traded
// funds, with no login. Its "B×+ Mercado de Capitales" page says it buys and
// sells "acciones e índices nacionales y extranjeros a través de valores
// mediante el SIC (Sistema Internacional de Cotizaciones)" and "a través del
// sistema SENTRA, ambos dentro del listado de valores de la Bolsa Mexicana de
// Valores BMV", with "Ejecución de órdenes de compra-venta a través de
// nuestra plataforma de internet". The Casa de Bolsa Móvil app shows
// "emisoras domésticas y SIC". Bx+ publishes no list of its own, so the book
// is the whole Bolsa Mexicana de Valores: the local board and the SIC
// foreign lines, shares, FIBRAs and ETFs (all shares of the exchange, ETFs
// included), all quoted in pesos. No page names BIVA, so no BIVA rows.
// The book is read by ../actinvertrade/bmvBook.mjs, shared with the other
// BMV-only brokers. It leaves out CKD and CERPI certificates, other trust and
// mutual-fund certificates, warrants and rights, lines that never traded,
// Mexican lines with no trade for over a year (suspended or delisted) and SIC
// lines with no BMV trade for over a year whose home listing is gone. See
// that file for the details.
// Not applied: the Casa de Bolsa en Línea page says that, "De acuerdo a los
// horarios de operación y tu perfil de inversión", the client may order
// "acciones de las empresas de alta y mediana bursatilidad que cotizan en la
// Bolsa Mexicana de Valores". It is framed by the client's investment profile
// (the FAQ: "siempre que tengas el perfil de inversión para ello"), the
// capital-market page offers SIC lines on the same internet platform, and the
// BMV publishes no reachable marketability (bursatilidad) list to filter on,
// so it is a remark, not a removal. Some SIC lines are open only to qualified
// investors under CNBV rules: also a remark.
//
// Fees (no login): "Por corretaje 1.70%", the maximum, "Monto de la operación
// por el (% de comisión aplicable máximo 1.70%)", plus custody 0.25% a
// bimester:
//   https://cb.vepormas.com.mx/PortalCBnuevo/Nosotros/Comisiones/Cuadro_de_Comisiones.pdf
//   https://www.vepormas.com/fwpf/portal/documents/productos-inversiones-pn-mercado-de-capitales
//   https://www.vepormas.com/fwpf/portal/documents/servicios-casa-de-bolsa-linea
//   https://www.vepormas.com/fwpf/portal/documents/servicios-casa-de-bolsa-movil
//
//   node brokers/bx/bx_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bmvBook } from "../actinvertrade/bmvBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet } = await bmvBook();
const out = stampRows(withoutObligations(rows));
for (const ticker of ["WALMEX", "FUNO/11", "AAPL", "NAFTRAC/ISHRS"]) {
  if (!out.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Bx+ catalogue`);
}
fs.writeFileSync(new URL("bx-parsed.json", import.meta.url), JSON.stringify(out, null, 2));
const count = {};
for (const row of out) count[row.type] = (count[row.type] || 0) + 1;
console.error(`bx: ${out.length} rows ${JSON.stringify(count)}; dropped ${dropped.length}, quiet SIC kept ${quiet.length}`);

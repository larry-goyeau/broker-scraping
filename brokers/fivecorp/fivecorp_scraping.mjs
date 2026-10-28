// What Five Corporation S.A. (ALyC integral n° 635 CNV, BYMA agent n° 66)
// sells in Buenos Aires shares and CEDEARs, with no login. It publishes no
// list of its own. Its home page names local shares and CEDEARs (accounts
// sit either at Five itself or on the Inviu platform of Grupo Galicia; the
// tariff below is Five's own):
//
//   https://fivesa.com.ar/
//   "Accedé al mercado local con acciones, bonos, CEDEARs, Cauciones,
//   Futuros, Licitaciones y FCI"
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso and MEP dollar (D) lines of every
// local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ included)
// that BYMA quotes and that trades. Cable (C) lines are not written: no
// Five page nor its tariff names cable / CCL settlement; dollars abroad are
// held in a separate Pershing or IBKR account ("Abrí cuenta tanto en
// Argentina como en el exterior"), which is another product. Block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out by the shared module. Bonds, futures, cauciones and
// funds are other products. No page names a segment, board or title the
// broker does not trade.
//
// Fees ("LISTADO DE ARANCELES", Resolución General CNV 616): "Renta
// variable / Contado" arancel mínimo 0/2000, máximo 2.50%; "Las operaciones
// efectuadas por internet tendrán un arancel del 50% de los expuestos en
// este cuadro"; market and Caja de Valores fees on top:
//   https://fivesa.com.ar/comisiones/
//   https://fivesa.com.ar/wp-content/uploads/2025/03/fivesa-comisiones-25.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/fivecorp/fivecorp_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Five Corporation", { cable: false });
fs.writeFileSync(new URL("fivecorp-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Five Corporation: ${rows.length} BYMA lines`);

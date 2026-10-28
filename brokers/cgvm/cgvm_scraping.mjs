// What CGVM (Compañía General de Valores Mobiliarios S.A., ALyC y AN
// n° 182 CNV, member of BYMA) sells in Buenos Aires shares and CEDEARs,
// with no login. The broker publishes no list of its own and its site
// names no product restriction; it trades on BYMA since 1981 ("Opera en el
// Mercado de Valores de Buenos Aires desde 1981") with a home broker and an
// app ("Compra y venta al instante"):
//
//   https://www.cgvm.com.ar/
//
// So the catalogue is BYMA's whole share and CEDEAR board (CEDEARs of US
// ETFs such as SPY and QQQ included), read by ../bancogalicia/bymaBook.mjs:
// the peso and MEP-dollar (D) lines of every local share and CEDEAR that
// BYMA quotes and that traded in the last months; block lines, closed-end
// funds, bond CEDEARs, rights, warrants and dormant or delisted lines are
// left out there. Cable (C) lines are not written: neither the site nor the
// fee schedule names cable or CCL dollars or a cash transfer abroad (its
// only foreign line moves securities: "Transferencia de titulos al
// Exterior $ 200"). Bonds, letras, ONs and options are other products.
//
// Fees ("Aranceles", renta variable): "Contado" minimum $50, 0.50% to
// 3.00%, plus IVA and BYMA market rights:
//   https://www.cgvm.com.ar/files/aranceles.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/cgvm/cgvm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("CGVM", { cable: false });
fs.writeFileSync(new URL("cgvm-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`CGVM: ${rows.length} rows`);

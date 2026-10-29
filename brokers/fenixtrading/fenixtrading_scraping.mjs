// What Fenix Trading (Montevideo, regulated by the BCU) sells online in
// shares and ETFs, with no login. Clients open an account online and trade
// in FenixGo; the fee page prices "Acciones · Operativa online (EE.UU.)",
// and the international-market page sells shares, preferred shares and
// ADRs: "Operá los mercados globales Abrí tu cuenta online y accedé a más
// de 30.000 instrumentos." It publishes no list and names no US exchange.
//
//   https://fenix-trading.com/costos-servicios
//   https://fenix-trading.com/mercado-internacional
//
// So the US place is the whole US exchange book of the day
// (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on every US exchange, less open trade halts,
// warrants, rights, units, when-issued lines and listed notes); the
// "30.000 instrumentos" cover more than this book (bonds, options), so they
// do not cut it. The US is one NBBO market: one row per title, in dollars.
// OTC is not named and is not added.
//
// Not added: the Bolsa de Valores de Montevideo that broker-list.json
// gives with the restriction "By phone/advisor only". The local-market page
// lists bonds, letras, trusts and shares with no online channel, and the
// fee page prices local orders through the desk ("Mesa de operaciones USD
// 50 por ticket"); only US shares are priced as online.
//
// Fees ("Costos y servicios"): "Acciones · Operativa online (EE.UU.) Tarifa
// Por acción Mínimo por operación Estándar USD 0,03 USD 25 Trader USD 0,02
// USD 10"; custody "1% anual o USD 150 el mayor de ambos":
//   https://fenix-trading.com/costos-servicios
//
//   node brokers/fenixtrading/fenixtrading_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await evidence("https://fenix-trading.com/costos-servicios", [/Operativa online \(EE\.UU\.\)/, /USD 0,03/, /Mesa de operaciones/]);
await evidence("https://fenix-trading.com/mercado-internacional", [/m[aá]s de 30\.000 instrumentos/]);

const book = await usBook();
const rows = stampRows(withoutObligations([...book]));
if (rows.length < 10000) throw new Error(`only ${rows.length} US rows`);
fs.writeFileSync(new URL("fenixtrading-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`Fenix Trading: ${rows.length} US rows`, counts);

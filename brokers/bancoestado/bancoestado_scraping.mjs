// What BancoEstado S.A. Corredores de Bolsa sells online in shares and
// ETFs, with no login. Its "Acciones y ETFs" page sells shares and ETFs
// through every channel (internet, branch, executive) at one price, and its
// help centre lists "Acciones, ETFs (Fondos Cotizados en Bolsa)" among the
// services for individuals. It publishes no list and names no restriction.
//
//   https://www.bancoestado.cl/content/bancoestado-public/cl/es/home/home/productos-/ahorro-e-inversiones-/compra-y-venta-de-acciones.html
//   https://www.bancoestado.cl/content/bancoestado-public/cl/es/home/home/productos-/ahorro-e-inversiones-/corredora-de-bolsa---bancoestado-personas.html
//
// broker-list.json gives two places, the Santiago Stock Exchange and the
// Bolsa Electrónica de Chile. The catalogue is the Bolsa de Comercio de
// Santiago's share and ETF book, read by ../banchile/santiagoBook.mjs:
// Chilean shares, the foreign shares and ETFs of the exchange's
// foreign-securities market and the Chilean ETFs, in pesos and in dollars
// as the exchange quotes each line (ordinary investment and mutual-fund
// lines and dormant lines left out there). The Bolsa Electrónica de Chile
// trades the same Chilean listings; its quotes are behind an account
// (apiprod.bolchile.com answers "Missing Authentication Token"), so it has
// no book of its own here and adds no row.
//
// Fees ("Acciones y ETFs"): 0,6% of the amount traded plus $2.500 per day
// with executed operations, plus IVA, whatever the channel; "BancoEstado
// S.A. Corredores de Bolsa no hace cobros adicionales por derechos de bolsa
// ni por custodia." Example: a $1.000.000 purchase costs $10.115.
// bancoestado.cl answers a security page to scripts, so the run checks no
// page of the broker.
//
// The Santiago exchange's site sits behind a bot manager: the price list is
// read in the owner's Chrome on port 9222 (see ../banchile/santiagoBook.mjs).
//
//   node brokers/bancoestado/bancoestado_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { santiagoBook } from "../banchile/santiagoBook.mjs";

const book = await santiagoBook("BancoEstado Corredores de Bolsa");
const rows = stampRows(withoutObligations(book.map(({ traded, ...row }) => row)));
fs.writeFileSync(new URL("bancoestado-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`BancoEstado Corredores de Bolsa: ${rows.length} Santiago rows`, book.kinds, `left out ${book.dropped.length}`);

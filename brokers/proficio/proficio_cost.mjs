// What one round trip costs at Proficio Investment (Proficio Investment
// S.A., ALyC AN Propio CNV no. 115, BYMA agent no. 20): buy n Buenos Aires
// shares or CEDEARs (ETF certificates included) at price p and sell them
// back, in dollars, ordered from the app or the web. Lines in pesos, in MEP
// dollars (D lines) and in cable dollars (C lines).
//
// Read on 2026-10-26. "Aranceles (*) Vigentes desde el 09-10-24":
//   https://proficioinvestment.com/wp-content/uploads/2024/10/Aranceles-Proficio-Investment-Vigencia-OCTUBRE-2024.10.09.pdf
//   "Compra/Venta de Títulos Privados: 0,6%", each side, no minimum
//   printed. "El IVA será aplicado según corresponda, sobre el importe de
//   la comisión ó arancel": a share or CEDEAR fee takes 21% IVA, 0.726% a
//   side. One rate for every channel and currency.
//   Note (*): "se le deberán sumar los derechos de Mercado y tasas de
//   registro ... que fijen Bolsas y Mercados Argentinos S.A. (BYMA)", so
//   BYMA's 0.05% + IVA a side (../bancogalicia/bymaCost.mjs, BYMA
//   "Derechos de Mercado sobre Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "Reducción de Aranceles por compra/ venta en el día ("intraday
//   trading")(**): 50%", (**) "Sólo para títulos privados": the figure
//   assumes the sale is another day; the waiver is the remark.
//
// Formula, each side: 0.6% × notional × 1.21 + 0.05% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: "Transferencias a depositarias exteriores USD 35 por especie
// transferida" and "Gastos de conversión 0,5 USD por ADR" (a transfer and a
// conversion, not this order), dividends (0.6%), Caja de Valores' charges
// on corporate events, and BYMA's day-trade bonus on the post-trade part
// (under 0.01% a side).
//
// Cash: pesos and dollars (the table prices "Caución ... en dólares", and
// the account agreement, Convenio PH clause 7, keeps client dollars and
// securities in an account abroad: "Las operaciones en el exterior sólo
// podrán ser efectuadas con Dólares Estadounidenses"), so a line settles in
// its own currency and no FX enters the number; the MEP quote's half
// spread (CCL on a C line) is the remark.
//   https://proficioinvestment.com/wp-content/uploads/2025/04/Convenio-PH-v1.6.7-1.pdf
//
//   node brokers/proficio/proficio_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/proficio/proficio_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/proficio/proficio_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/proficio/proficio_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "proficio",
  name: "Proficio Investment",
  catalogue: new URL("proficio-parsed.json", import.meta.url),
  schedule: {
    url: "https://proficioinvestment.com/wp-content/uploads/2024/10/Aranceles-Proficio-Investment-Vigencia-OCTUBRE-2024.10.09.pdf",
    page: "https://proficioinvestment.com/productos-y-servicios/",
    readOn: "2026-10-26",
    inForce: "2024-10-09",
    entity: "Proficio Investment S.A. (ALyC AN Propio CNV n° 115)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.006 },
  vatOnCommission: true,
  basis: "titres privés : 0,6 % + IVA par sens, sans minimum ; droits BYMA 0,05 % + IVA",
  remark: "If bought and sold the same day, commission is 50% lower.",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);

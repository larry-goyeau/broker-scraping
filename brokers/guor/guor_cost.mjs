// What one round trip costs at GUOR Investments (GUOR Investments S.A.,
// ALyC no. 496 at the CNV, Rosario): buy n Buenos Aires shares or CEDEARs
// (ETF certificates included) at price p and sell them back, in dollars,
// ordered on Matriz OMS (web, Android, iOS). Lines in pesos and in MEP
// dollars (D lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "Aranceles", "Vigencia a partir de: 01/06/2026":
//   https://www.guor.com.ar/Recursos/Pdf/aranceles.pdf
//   Columns "ARANCEL MÍNIMO / ARANCEL MÁXIMO / ARANCEL BASE FIJO";
//   "CPA/VTA PRIVADOS 1.00 % 1.20 % $ 5.000.00", each side. The sheet does
//   not say which client pays which rate, so the figure is the 1.20%
//   ceiling (owner rule: a range takes the max). "Base fijo" is read as the
//   per-operation minimum, not an add-on: the same column prints "S/M"
//   (sin mínimo) on cauciones and managed accounts, and the footer reserves
//   the right to change "los montos mínimos". A CEDEAR is a private share
//   line on BYMA. The $5,000 floor is pesos; a dollar line takes its peso
//   equivalent (fx.mjs). It binds below about 417,000 pesos (USD 275).
//   IVA: the sheet prints none; a broker's commission on a share or a
//   CEDEAR bears 21% IVA in Argentina, as in ../cohen and ../arata. Added,
//   on the fee the minimum sets as well.
//   Market rights: not on the sheet, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "Sobre los gastos y comisiones por operaciones de otras entidades, Guor
//   Investments S.A., se reserva el derecho de trasladar al cliente los
//   gastos generados": those are BYMA's rights, already in the figure.
//   "CUSTODIA TÍTULOS Sin Cargo". "MANTENIMIENTO CUENTA $ 5.200.00", no
//   period printed: in the remark, with the 1.00% floor of the range:
//   (1.20% - 1.00%) / 1.20% = 17% of the commission, buy and sell.
//
// Formula, each side: max(1.20% × notional, $5,000) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: account maintenance (remark), dividends (0.80% to 1.20%,
// minimum $5,000), transfers of cash ($6,500; USD 8 to 12) and securities,
// and BYMA's day-trade bonus on the post-trade part (under 0.01% a side;
// the figure assumes another day).
//
// Cash: pesos and dollars (the sheet bills "TRANSFERENCIA $ EMISORA" and
// "TRANSFERENCIA u$s EMISORA" from the account; the business page offers
// "Cauciones en pesos o dólares"), so a line settles in its own currency
// and no FX enters the number; the MEP quote's half spread is the remark.
//
//   node brokers/guor/guor_cost.mjs GGAL BCBA ARS --shares=200 --price=7500
//   node brokers/guor/guor_cost.mjs SPY BCBA ARS --shares=70 --price=21500
//   node brokers/guor/guor_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/guor/guor_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "guor",
  name: "GUOR Investments",
  catalogue: new URL("guor-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.guor.com.ar/Recursos/Pdf/aranceles.pdf",
    page: "https://www.guor.com.ar/",
    readOn: "2026-10-26",
    inForce: "2026-06-01",
    entity: "GUOR Investments S.A. (ALyC n° 496)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.012, minArs: 5000 },
  vatOnCommission: true,
  basis: "compra-venta privados : 1,00 % à 1,20 % (maximum retenu) + IVA par sens, minimum (« base fijo ») 5 000 pesos + IVA ; droits BYMA 0,05 % + IVA",
  notes: ["IVA ajouté : le barème n'en dit rien", "tenue de compte 5 200 pesos, période non imprimée, hors ordre"],
  remark: "Fees might be 17% lower. Account maintenance 5,200 pesos.",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);

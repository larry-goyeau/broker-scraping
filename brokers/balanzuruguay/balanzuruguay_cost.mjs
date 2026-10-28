// What one round trip costs at Balanz Uruguay: buy n US-listed shares or ETFs
// at price p, sell them straight back, in dollars. Two channels, two tariffs,
// one row each (`plan`):
//
//   corredor   Balanz Uruguay Corredor de Bolsa S.A. (the default; the
//              tariff linked from /corredor-bolsa), read 2026-10-26:
//              https://cms.balanz.com/PFS/107316_tarifariobalanzuruguaycorredordebolsasa.pdf
//                "Comisión por compra/venta de acciones Hasta el 2% del valor
//                efectivo de la operación  Mínimo USD 100"
//                "Costo acciones por operación de compra/venta USD 12"
//                "Costo por mantenimiento de cuenta Hasta 0.25% anual sobre
//                AUM  Mínimo USD 300" (remark, not in the trip)
//   agente     Balanz Uruguay Agente de Valores S.A., account at Pershing
//              ("brindamos acceso a los principales mercados internacionales
//              y bancos de inversión en USA (Pershing)"), tariff "vigencia
//              desde Agosto 2023", read 2026-10-26:
//              https://cms.balanz.com/PFS/119732_tarifarioagenteystonex2026.pdf
//                "Comisión por compra/venta de acciones Hasta el 2% del valor
//                de la operación" (no minimum on that line; the StoneX page
//                of the same PDF prints the same 2 %)
//                "Cargo por mantenimiento anual Hasta el 0.75% del valor de
//                la cuenta", "Cargo por cuenta NON-US 50" a year (remark)
//
// Owner rule: a discretionary "hasta" takes the max, so 2 % each side. SEC,
// TAF and CAT are not printed: 0.
//
// Formula: book (quoted NBBO) + 2 × ticket, ticket =
//   corredor  max(2 % × notional, $100) + $12
//   agente    2 % × notional
//
// Online: both channels are advised ("asesoramiento personalizado", the
// agent "canalizar órdenes de clientes"); no page says a client can place a
// US-share order online (the client web access is a log-in only). So
// onlineBuy is false on both rows.
//   https://www.balanz.com.uy/   https://www.balanz.com.uy/agente
//
// Routing: Pershing LLC carries the agent's accounts and its tariff has a
// StoneX page: ALIASES `balanzuruguayagente` in spreads/rule606.mjs takes
// the higher Q of the two. The corredor's US dealer is not named: quoted
// NBBO.
//
// Cash is dollars (the tariffs are in USD; local transfers out "USD 1 o el
// equivalente en UYP") and every line is in dollars: no conversion.
// Transfers (USD 85 out abroad, USD 10 in), ACAT (USD 175) and coupons stay
// out.
//
//   node brokers/balanzuruguay/balanzuruguay_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/balanzuruguay/balanzuruguay_cost.mjs SPY ARCX USD --shares=1.3129 --price=761.69 --plan=agente
//   node brokers/balanzuruguay/balanzuruguay_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, makePlanOf, printCli } from "../wellstrade/usCost.mjs";

const PLANS = {
  corredor: {
    label: "Corredor de Bolsa",
    rate: 0.02,
    min: 100,
    perOrder: 12,
    url: "https://cms.balanz.com/PFS/107316_tarifariobalanzuruguaycorredordebolsasa.pdf",
    remark: "Account fee up to 0.25% a year, min $300.",
  },
  agente: {
    label: "Agente de Valores (Pershing)",
    rate: 0.02,
    min: 0,
    perOrder: 0,
    url: "https://cms.balanz.com/PFS/119732_tarifarioagenteystonex2026.pdf",
    rule606: "balanzuruguayagente",
    remark: "Account fee up to 0.75% a year, plus $50 a year.",
  },
};

/** Balanz's charge on one order, in dollars, on `plan`. */
export function ticket({ notionalUsd }, plan) {
  if (!(notionalUsd > 0) || !plan) return null;
  return Math.max(notionalUsd * plan.rate, plan.min) + plan.perOrder;
}

const SCHEDULE = {
  broker: "Balanz Uruguay",
  folder: "balanzuruguay",
  catalogueUrl: new URL("balanzuruguay-parsed.json", import.meta.url),
  url: PLANS.corredor.url,
  readOn: "2026-10-26",
  entity: "Balanz Uruguay Corredor de Bolsa S.A. / Balanz Uruguay Agente de Valores S.A. (Pershing LLC)",
  rule606: null,
  cash: "USD",
  deposits: ["USD", "UYU"],
  feeCurrency: "USD",
  plans: PLANS,
  defaultPlan: "corredor",
  planAlias: { corredor: "corredor", corredordebolsa: "corredor", cb: "corredor", agente: "agente", agentedevalores: "agente", pershing: "agente", stonex: "agente" },
  ticket: (ctx) => {
    const each = ticket(ctx, ctx.plan);
    if (each == null) return null;
    const p = ctx.plan;
    return {
      buy: each,
      sell: each,
      note:
        p.min > 0
          ? `${p.label} : max(2 % × ${Number(ctx.notionalUsd.toFixed(2))} $, ${p.min} $) + ${p.perOrder} $ = ${Number(each.toFixed(2))} $ par ordre`
          : `${p.label} : 2 % × ${Number(ctx.notionalUsd.toFixed(2))} $ = ${Number(each.toFixed(2))} $ par ordre`,
    };
  },
  levies: { sec: false, taf: false, cat: false },
  onlineBuy: false,
  remark: (ctx) => ctx.plan?.remark || "",
  basis: (ctx) =>
    ctx.plan?.min > 0
      ? "tarifaire Balanz Uruguay Corredor de Bolsa, relu le 2026-10-26 : « Hasta el 2% … Mínimo USD 100 » + « Costo acciones por operación de compra/venta USD 12 », le maximum retenu"
      : "tarifaire Balanz Uruguay Agente de Valores (Pershing), relu le 2026-10-26 : « Hasta el 2% del valor de la operación », le maximum retenu",
  notes: [
    "service conseillé, aucun ordre en ligne décrit : onlineBuy false",
    "agente : Q le plus haut de Pershing et StoneX (606 2026 T2) ; corredor sans courtier US nommé : NBBO coté",
    "frais de tenue de compte, virements, ACAT et coupons hors trajet",
  ],
};

export const planOf = makePlanOf(SCHEDULE);

export function roundTrip(query) {
  const plan = planOf(query.plan);
  return usRoundTrip({ ...SCHEDULE, rule606: plan?.rule606 ?? null }, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);

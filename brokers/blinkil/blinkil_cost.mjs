// What one round trip costs at Blink (heyblink.com, a Tel Aviv Stock
// Exchange member): buy n shares at price p, sell them back at once, in the
// app, in regular hours, in dollars. The 10,000 US stocks and ETFs of the
// catalogue, whole or fractional.
//
// Pricing page, full tariff PDF (blink-trading-fees-070926) and the support
// pages read 2026-10-26:
//   https://heyblink.com/pricing/
//   https://heyblink.com/wp-content/uploads/2026/09/blink-trading-fees-070926.pdf
//   https://heyblink.com/support-category/withdrawals-and-deposits/
//   https://heyblink.com/support-category/investments/
//
//   commission   "$0.01 למניה או לחלק היחסי ממנה" ($0.01 a share or the
//                proportional part of one), "מינימום $1.5 לפעולה" (minimum
//                $1.5 an order), "מקסימום 1.8% משווי הפעולה" (maximum 1.8%
//                of the order's value). The PDF prices "ניירות ערך בחוץ
//                לארץ – רק ארה"ב" (securities abroad, US only) the same way.
//                Each order, so each way. 0 for "up to 10 trades or 1,000
//                shares a month": the trip is counted inside that allowance
//                (owner, 2026-10-27) while its two orders stay within 1,000
//                shares; the tariff after it is the remark.
//   SEC/TAF/CAT  not printed, so 0 (owner's rule).
//   custody      "דמי ניהול/טיפול פיקדון ניירות ערך: פטור" (exempt).
//   FX           every deposit route is charged in shekels ("החיוב מתבצע
//                בשקלים"), and Blink converts it to dollars ("נמיר את הסכום
//                באופן אוטומטי לדולרים (USD)") at its own rate shown in the
//                app ("שער ההמרה שיקבע על ידי בלינק"); withdrawals go back
//                to shekels the same way. The FAQ says "איננו גובים עמלת
//                המרה" (no conversion commission) and the PDF prints "עמלת
//                חליפין: פטור", but the PDF also lists a "מרווח המרה"
//                (conversion spread) line priced only "according to the
//                rate set by Blink": a spread with no figure.
//
// Formula: book (605 × Q) + 0 inside the monthly allowance (2 × n ≤ 1,000),
// else 2 × min(max($0.01 × n, $1.5), 1.8% × amount); + FX both ways. USD is not a deposit currency and the spread is not
// published, so the total is N/A (owner's rule; no group figure exists).
//
// Routing: the US custodian and broker is Interactive Brokers LLC (CRD
// 36418) ("החיבור שלנו לבורסה בארצות הברית נעשה דרך Interactive Brokers
// LLC"), so a listed US line takes IB's Q ("interactivebrokers").
//
// Left out: securities transfers ($8 a foreign line), and the Irish ETFs in
// London and Tel Aviv funds (not this catalogue).
//
//   node brokers/blinkil/blinkil_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/blinkil/blinkil_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const PER_SHARE = 0.01;
const MIN = 1.5;
const MAX_RATE = 0.018;
const FREE_SHARES = 1000;

const SCHEDULE = {
  broker: "Blink",
  folder: "blinkil",
  catalogueUrl: new URL("blinkil-parsed.json", import.meta.url),
  url: "https://heyblink.com/pricing/",
  readOn: "2026-10-26",
  entity: "Blink (TASE member), Interactive Brokers LLC (US broker and custodian)",
  rule606: "interactivebrokers",
  cash: "ILS",
  deposits: ["ILS"],
  feeCurrency: "USD",
  ticket: (ctx) =>
    2 * ctx.shares <= FREE_SHARES ? 0 : Number(Math.min(Math.max(PER_SHARE * ctx.shares, MIN), MAX_RATE * ctx.notionalUsd).toFixed(6)),
  levies: { sec: false, taf: false, cat: false },
  fx: { unpublished: true },
  remark: "If more than 10 trades or 1,000 shares a month, fees are $0.01 a share (min $1.5, max 1.8%).",
  basis:
    "tarifs Blink (page et PDF blink-trading-fees-070926), relus le 2026-10-26 : " +
    "0,01 $ la part, minimum 1,5 $, maximum 1,8 % de l'ordre, à chaque sens",
  notes: [
    "courtier et dépositaire américain Interactive Brokers LLC (CRD 36418) : Q d'IB",
    "dépôts en shekels seulement, compte en dollars : change forcé au cours de Blink, marge non publiée",
    "10 ordres ou 1 000 parts gratuits par mois : aller-retour compté dans la franchise (0 $), le tarif au-delà en remarque",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);

// What Rava Bursátil (Rava Bursátil S.A., ALyC y AN Propio n° 332 CNV,
// member of BYMA, MAV and ROFEX) sells in shares and exchange-traded funds,
// with no login. It publishes no list for the US (its quote pages print the
// local boards). Its offer page says one account trades both:
//
//   https://www.rava.com/que-ofrecemos
//   "Abrís una cuenta y accedés al mercado local y al mundo." "Acciones
//   argentinas / Cedears / Títulos públicos / Acciones de Wall Street /
//   ETFs / ..." "Operá desde la web y la app".
//
// Buenos Aires: BYMA's whole share and CEDEAR board (CEDEARs of US ETFs
// included), read by ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D)
// and cable (C) lines of every local share and CEDEAR that BYMA quotes and
// that trades. Cable lines are kept: the account holds Wall Street shares
// abroad ("Mandatos en el exterior", dollar minimum u$s 20). Block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out by the shared module.
//
// United States: no exchange named and no exception, so the whole US
// exchange book of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas exchanges, less open trade
// halts, warrants, rights, units, when-issued lines and listed notes. OTC
// lines are not added. One row per title, in dollars.
//
// Remark, not a removal: the account needs "un mínimo de apertura de
// $12.000.000".
//
// Fees ("Aranceles y gastos", maximums): renta variable "Contado* $0 0,80%
// + IVA + DM 0,08%" and "Mandatos en el exterior u$s 20 + IVA 0,80% + IVA":
//   https://www.rava.com/nuestros-servicios/aranceles
//
//   node brokers/rava/rava_scraping.mjs

import { bymaUs, evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.rava.com/que-ofrecemos", [/accedés al mercado local y al mundo/i, /Acciones de Wall Street/i, /ETFs/, /Cedears/]);
await evidence("https://www.rava.com/nuestros-servicios/aranceles", [/Mandatos en el exterior\s*u\$s 20 \+ IVA\s*0,80% \+ IVA/i, /0,80% \+ IVA \+ DM 0,08%/]);

await bymaUs("Rava Bursátil", new URL("rava-parsed.json", import.meta.url), { cable: true });

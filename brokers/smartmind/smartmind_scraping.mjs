// What SmartMind Securities sells in shares and exchange-traded funds, with
// no login. The broker's web price board (the FSS FlexTrade app; the
// price.smartmind.vn link lands here) is the book: its round-lot snapshot
// and its odd-lot snapshot per floor, which name the floor, a type and, for
// funds, ETF or closed-end. The round-lot snapshot on some hosts misses
// recent listings that the odd-lot one has, so the two are joined. Shares
// and ETFs on HOSE, HNX and UPCOM are kept. Covered warrants, bonds,
// futures and closed-end funds are other products and are not written. A
// line with no trading date has no session today (a delisted name) and is
// not written. The board prints no ISIN; the Vietnamese number is built
// from the ticker.
//
// The board's TLS certificate is sent without its intermediate. This
// fetches that intermediate from the address the certificate itself names
// (GlobalSign), checks it is that CA, and adds it to the trusted set; the
// chain is still verified.
// The shared rules are in ../vix/vnboard.mjs.
//
//   https://trading.smartmind.vn/priceboard/
//   https://trading.smartmind.vn/datafeed/instruments
//   https://trading.smartmind.vn/datafeed/oddLotInstruments?exchange=UPCOM   (HOSE, HNX)
//   http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt
//
//   node brokers/smartmind/smartmind_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import tls from "node:tls";
import { finish, fssBoard, request } from "../vix/vnboard.mjs";

const HOST = "https://trading.smartmind.vn";
const INTERMEDIATE = "http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt";

const der = Buffer.from(await (await request(INTERMEDIATE)).arrayBuffer());
const intermediate = new crypto.X509Certificate(der);
if (!/CN=GlobalSign RSA OV SSL CA 2018/.test(intermediate.subject)) {
  throw new Error(`${INTERMEDIATE} is ${intermediate.subject.replace(/\n/g, ", ")}`);
}
tls.setDefaultCACertificates([...tls.getCACertificates("default"), intermediate.toString()]);

const { lines, leftOut } = await fssBoard(HOST);
const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("smartmind-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

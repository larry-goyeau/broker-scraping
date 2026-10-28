// What CCB International Securities (建銀國際證券, Hong Kong) sells in shares
// and ETFs, with no login: Hong Kong stocks, Shanghai and Shenzhen A-shares
// through Northbound Stock Connect (中港通), and US stocks (美股). Its client
// trading pages (證券交易: 網上交易, 手機及客戶端下載, 收費表 with the tabs 中港通
// and 美股) publish a fee table for each and no list of titles.
//
// Fees: Hong Kong "佣金 0.25%，最低收費$100"; 中港通 "交易總額之0.25%，最低收費
// ¥100", with a separate table "交易費用（交易所買賣基金）" for ETFs; 美股
// "經紀佣金 每股0.018美元 (最低收費10美元)".
//
// Hong Kong is HKEX's whole book of shares, REITs and ETPs
// (../primehk/hkexBook.mjs; HKD, USD and RMB counters as their own codes).
// Stock Connect is HKEX's Northbound buy-and-sell lists
// (../bocomhk/connectBook.mjs); STAR Market and ChiNext shares stay with a
// remark, as broker-list.json says ("STAR Market / ChiNext for institutional
// professional investors only": the Stock Connect rule, which CCBI's pages
// do not restate). The US is the whole exchange book of the day
// (../wellstrade/usBook.mjs): no CCBI page names a US exchange or a kind
// of US share or fund it does not sell.
//
// Exception the broker names (online trading notice, 網上交易):
//   "由2014年3月1日起 ... 我們將不會就駐意大利公司的股份買賣參與的金融工具、
//   相當於股本投資的證券 ... 提供任何服務 (包括保管和買賣)。... (包括但不限於
//   Prada S.p.A（香港聯交所的股份代號：1913）"
// so a line with an Italian ISIN (IT...) or an issuer named "S.p.A." (an
// Italian company's ADR keeps a US ISIN: ENI, Genenta) is left out, on HKEX
// and in the US.
//
// www.ccbintl.com.hk sends its certificate without the Thawte EV RSA CA G2
// intermediate, so the pages are read with that intermediate taken from
// DigiCert's AIA address (the chain is still verified).
//
//   https://www.ccbintl.com.hk/Big5/securities2.html
//   https://www.ccbintl.com.hk/Big5/disclaimer_iwtrader.html
//   https://www.ccbintl.com.hk/Big5/iwtrader.html
//
// Fees:
//   https://www.ccbintl.com.hk/Big5/securities6.html   (Hong Kong)
//   https://www.ccbintl.com.hk/Big5/securities7.html   (中港通)
//   https://www.ccbintl.com.hk/Big5/securities8.html   (美股)
//
//   node brokers/ccbi/ccbi_scraping.mjs

import https from "node:https";
import tls from "node:tls";
import { X509Certificate } from "node:crypto";
import { evidence, hkCatalogue } from "../bocomhk/hkCatalogue.mjs";

const SITE = "https://www.ccbintl.com.hk/Big5";
const INTERMEDIATE = "http://cacerts.digicert.com/ThawteEVRSACAG2.crt";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const der = Buffer.from(await (await fetch(INTERMEDIATE, { signal: AbortSignal.timeout(30_000) })).arrayBuffer());
const ca = [...tls.rootCertificates, new X509Certificate(der).toString()];
const get = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, { ca, headers: { "User-Agent": UA }, timeout: 45_000 }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${response.statusCode} ${url}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });

await evidence(`${SITE}/securities6.html`, [/0\.25%，最低收費\$100/], { get });
await evidence(`${SITE}/securities7.html`, [/交易總額之0\.25%，最低收費 ¥100/, /交易所買賣基金/], { get });
await evidence(`${SITE}/securities8.html`, [/每股0\.018美元 \(最低收費10美元\)/], { get });
await evidence(`${SITE}/disclaimer_iwtrader.html`, [/我們將不會就駐意大利公司的股份/, /Prada S\.p\.A（香港聯交所的股份代號：1913）/], { get });

const italian = (row) => /^IT/.test(row.isin) || /\bS\.p\.A\b/i.test(row.name) || (row.mic === "XHKG" && /\bPRADA\b/i.test(row.name))
  ? "Italian company (no service since 1 March 2014)"
  : "";

await hkCatalogue({
  folder: "ccbi",
  connect: { STAR: "remark", ChiNext: "remark" },
  us: { mics: null },
  drop: italian,
  least: { HKEX: 2500, connect: 3500, US: 10000 },
});

// Every share and exchange-traded fund on Borsa Istanbul, for the brokers
// that sell the whole equity market (../ziraat, ../tera, ../ahlatci).
//
// The list is KAP's, the exchange's public disclosure platform, which
// Borsa Istanbul's listed-companies page sends to:
// - the shares: the stock codes of the companies on its BIST companies
//   page. One company can have several codes ("KRDMA, KRDMB, KRDMD"), and
//   the page also names the code under which a bank or a broker issues
//   bonds only ("AKTIF", "AFB"); a code is kept as a share when TradingView
//   files it on BIST as a common or preferred share or as an investment
//   trust (a closed-end fund there);
// - the funds: the exchange-traded funds (fund type BYF) on its funds page.
//
// TradingView's symbol search (../cgsid/tvlist.mjs) gives each code its
// name, ISIN and quote currency. All are in lira.
//
//   https://www.borsaistanbul.com/en/companies/listed-companies
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//
// gcm (../gcm) keeps its fund lines under the fund's BIST code (ZGOLD, not
// the board's ZGOLDF); KAP and TradingView print that code too.
//
// The KAP codes TradingView has no page for (160 on 2026-10-22) were each
// checked on the company's KAP summary ("Sermaye Piyasası Aracının İşlem
// Gördüğü Pazar"): 139 are issuers whose only market is the bond market
// ("Kesin Alım Satım Pazarı", mostly "Nitelikli Yatırımcılar Arasında":
// leasing-certificate SPVs, factoring and finance companies, unlisted banks
// and firms such as DNYVA Dünya Varlık Yönetim, EKER, OPET, TV8TV), AKM
// and AKMEN (AKM Yatırım) issue warrants and bonds only, and the other 19
// are a second code of a company whose share is already here
// (ALK of ALBRK, TGB of GARAN, TIB of ISCTR, TRA of TERA, IYM of ISMEN, KLN
// of KLNMA ...). None is a share. As a second check, İş Yatırım's page of
// every BIST share (630 codes on 2026-10-22) is compared with the result and
// any code it names that is not here is reported (isYatirimOnly).
//
//   https://www.kap.org.tr/tr/sirket-bilgileri/ozet/8acae2c569cee403016b991858035a54 (DNYVA)
//   https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx

import { isinOf, kindOf, normalize, pool, searchAll } from "../cgsid/tvlist.mjs";

const COMPANIES = "https://www.kap.org.tr/tr/bist-sirketler";
const FUNDS = "https://www.kap.org.tr/tr/YatirimFonlari/BYF";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// KAP carries its data as escaped JSON inside the HTML.
async function kapPage(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(90_000) });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return (await response.text()).replace(/\\"/g, '"');
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * 2 ** attempt);
  }
  throw new Error(last);
}

async function kapCompanies() {
  const html = await kapPage(COMPANIES);
  const codes = new Map();
  const matches = [...html.matchAll(/"kapMemberTitle":"([^"]*)","relatedMemberTitle":"[^"]*","stockCode":"([^"]*)"/g)];
  for (const [, title, list] of matches) {
    for (const code of list.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean)) {
      if (!/^[A-Z0-9]{3,6}$/.test(code)) throw new Error(`KAP stock code ${code}`);
      if (!codes.has(code)) codes.set(code, normalize(title));
    }
  }
  if (matches.length < 600 || codes.size < 650) throw new Error(`KAP lists only ${matches.length} companies, ${codes.size} codes`);
  return codes;
}

async function kapFunds() {
  const html = await kapPage(FUNDS);
  const funds = new Map();
  for (const [, code, title, state] of html.matchAll(
    /"fundCode":"([A-Z0-9]+)","fundName":"([^"]*)","fundType":"BYF","fundClass":"[^"]*","fundState":"([^"]*)"/g
  )) {
    if (state !== "Y") continue;
    if (!funds.has(code)) funds.set(code, normalize(title));
  }
  if (funds.size < 25) throw new Error(`KAP lists only ${funds.size} exchange-traded funds`);
  return funds;
}

// The share codes on İş Yatırım's page of every BIST share, or null when
// the page cannot be read (the check is then skipped, not failed).
const IS_YATIRIM = "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx";
async function isYatirimCodes() {
  try {
    const response = await fetch(IS_YATIRIM, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(90_000) });
    if (!response.ok) return null;
    const codes = new Set([...(await response.text()).matchAll(/hisse=([A-Z0-9]{3,6})\b/g)].map((match) => match[1]));
    return codes.size >= 500 ? codes : null;
  } catch {
    return null;
  }
}

// An investment trust (yatırım ortaklığı: İş Yatırım Ortaklığı, the
// venture-capital trusts) is a listed company whose shares trade on the
// equity market; TradingView files it as a closed-end fund. It stays a
// share, as in ../gcm.
function isTrust(line) {
  return line.type === "fund" && (line.typespecs || []).includes("closedend");
}

// The TradingView line on BIST whose code is exactly `code`.
async function lookUp(code, searchType) {
  const lines = await searchAll(code, "BIST", searchType);
  return lines.find((line) => line.exchange === "BIST" && normalize(line.symbol).toUpperCase() === code) || null;
}

export async function bistListings() {
  const [companies, funds] = await Promise.all([kapCompanies(), kapFunds()]);
  const rows = [];
  const notShares = [];
  const missing = [];
  const take = (code, line, type, kapTitle) => {
    const isin = isinOf(line.isin);
    const currency = normalize(line.currency_code).toUpperCase();
    if (currency !== "TRY") throw new Error(`${code} is quoted ${currency || "nowhere"}`);
    const name = normalize(line.description) || kapTitle;
    const row = { query: code, ticker: code, name, exchange: "BIST", mic: "XIST", currency: "TRY", type };
    if (isin) row.isin = isin;
    row.raw = [code, kapTitle, "BIST", isin, type].filter(Boolean).join(" ");
    rows.push(row);
  };
  await pool([...companies.keys()], 8, async (code) => {
    const line = await lookUp(code, "");
    if (!line) return missing.push(code);
    if (kindOf(line) !== "STOCK" && !isTrust(line)) return notShares.push(code);
    take(code, line, "STOCK", companies.get(code));
  });
  await pool([...funds.keys()], 8, async (code) => {
    const line = await lookUp(code, "");
    if (!line) return missing.push(code);
    take(code, line, "ETF", funds.get(code));
  });

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.ticker)) throw new Error(`${row.ticker} is both a share and a fund`);
    seen.add(row.ticker);
  }
  rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
  const shares = rows.filter((row) => row.type === "STOCK").length;
  const etfs = rows.filter((row) => row.type === "ETF").length;
  if (shares < 550) throw new Error(`only ${shares} BIST shares`);
  if (etfs < 25) throw new Error(`only ${etfs} BIST funds`);
  for (const ticker of ["THYAO", "GARAN", "ASELS", "KRDMD", "EKGYO", "ZGOLD", "GLDTR"]) {
    if (!seen.has(ticker)) throw new Error(`missing ${ticker}`);
  }
  const isYatirim = await isYatirimCodes();
  const isYatirimOnly = isYatirim ? [...isYatirim].filter((code) => !seen.has(code)).sort() : null;
  if (isYatirimOnly?.length) console.error(`bist: İş Yatırım lists shares missing here: ${isYatirimOnly.join(" ")}`);
  return { rows, notShares: notShares.sort(), missing: missing.sort(), kapCodes: companies.size, kapFunds: funds.size, isYatirimOnly };
}

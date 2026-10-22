// ISINs of Pakistan Stock Exchange lines that the shared lists
// (assets/stocks.csv, assets/etfs.csv) do not carry: the nine PSX ETFs and
// a few small or recently listed companies. Used by standardcapital and
// abbasi after stampRows, for a row still without ISIN.
//
// Sources, read 2026-10-21. The official places were tried first and did
// not answer: the PSX data portal (dps.psx.com.pk/company/<SYM>, which
// prints the ISIN) closes the connection on every path but its home page,
// CDC Pakistan (cdcpakistan.com) and NCCPL (nccpl.com.pk) answer 403. So
// these come from third-party pages: TradingView's PSX symbol pages
// (https://www.tradingview.com/symbols/PSX-<SYM>/), with Investing.com for
// four of the ETFs and OpenFIGI (https://www.openfigi.com/) for the shares
// agreeing. Each code passes the ISIN check digit. Replace a line by the
// portal's value when it answers again.
//
// TISL (Tasdeeq) moved from the GEM board to the Main Board on 24 August
// 2026; GEMPACRA is still on the GEM board.

export const PSX_ISINS = {
  // ETFs
  ACIETF: { isin: "PK0088806069", name: "Alfalah Consumer Index ETF" },
  HBLTETF: { isin: "PK0086206072", name: "HBL Total Treasury ETF" },
  JSGBETF: { isin: "PK0082806016", name: "JS Global Banking Sector ETF" },
  JSMFETF: { isin: "PK0086006035", name: "JS Momentum Factor ETF" },
  MIIETF: { isin: "PK0133706017", name: "Mahaana Islamic Index ETF" },
  MZNPETF: { isin: "PK0087306053", name: "Meezan Pakistan ETF" },
  NBPGETF: { isin: "PK0089106048", name: "NBP Pakistan Growth ETF" },
  NITGETF: { isin: "PK0096106015", name: "NIT Pakistan Gateway ETF" },
  UBLPETF: { isin: "PK0087206139", name: "UBL Pakistan Enterprise ETF" },
  // Shares
  GEMPACRA: { isin: "PK0115301019", name: "The Pakistan Credit Rating Agency Ltd" },
  HKKT: { isin: "PK0037001010", name: "Hakkim Textile Mills Ltd" },
  KAKL: { isin: "PK0070901019", name: "Kaiser Arts & Krafts Ltd" },
  MOHE: { isin: "PK0060901011", name: "Mohib Exports Ltd" },
  NAFL: { isin: "PK0055901018", name: "National Fibres Ltd" },
  NINA: { isin: "PK0076601019", name: "Nina Industries Ltd" },
  PICL: { isin: "PK0034801016", name: "Pak Industrial & Commercial Leasing Ltd" },
  PRIB: { isin: "PK0042701018", name: "Prudential Investment Bank Ltd" },
  REGAL: { isin: "PK0035001012", name: "Regal Ceramics Ltd" },
  SCHT: { isin: "PK0049301010", name: "Schon Textiles Ltd" },
  SDOT: { isin: "PK0049001016", name: "Sadoon Textile Industries Ltd" },
  SOYASUP: { isin: "PK0156901016", name: "Agro Processors & Atmospheric Gases Ltd" },
  SURAJ: { isin: "PK0018701018", name: "Suraj Ghee Industries Ltd" },
  SWL: { isin: "PK0013001018", name: "Standard Worldwide Ltd" },
  TAJT: { isin: "PK0038901010", name: "Taj Textile Mills Ltd" },
  TISL: { isin: "PK0166801016", name: "Tasdeeq Information Services Ltd" },
  USMT: { isin: "PK0000701018", name: "Usman Textile Mills Ltd" },
};

// Fills the ISIN of a row stampRows left empty; returns how many it filled.
export function fillPsxIsins(rows) {
  let filled = 0;
  for (const row of rows) {
    if (row.isin) continue;
    const known = PSX_ISINS[String(row.ticker || "").toUpperCase()];
    if (!known) continue;
    row.isin = known.isin;
    filled += 1;
  }
  return filled;
}

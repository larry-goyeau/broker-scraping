# broker-scraping

This project helps individual and professional investors compare brokers for a given asset. Each broker has one script that scrapes that broker’s catalogue, and another that gives the trading cost of each asset. Each broker also has the list of countries whose residents can invest.

## Cost estimator

The round-trip cost (buy and sell) is the book you cross, plus the broker’s charges, plus a tax when that schedule names one.

On a US listing the book starts from the monthly Rule 605 effective spread (orders of 100 to 499 shares, dollars per share, price improvement included). Rule 606 says where that broker-dealer sends market orders, and that mix scales the 605 figure. A broker outside the US that names a US dealer uses that dealer’s mix. With no 606, the book is the average NBBO. Outside the US, the book is that venue’s own bid and ask, brought back to the average hour of the session. One venue’s tape is not copied onto another.

## Layout

A broker’s scraper, cost script, and catalogue live in `<broker>/`. `<broker>_scraping.mjs` uses a real account at the broker it scrapes. The catalogue is what that signed-in session is shown.

| Path | What it is |
| --- | --- |
| `<broker>/<broker>_scraping.mjs` | Builds `<broker>/<broker>-parsed.json` |
| `<broker>/<broker>_cost.mjs` | One round trip at that broker. `roundTrip({ etf, place, currency, shares, price })` |
| `etfs.csv`, `stocks.csv`, `cryptos.csv` | List of all asset |
| `venues.mjs` | Exchange names, hours, and which tape each one uses |
| `spread.mjs` | Reads those tapes into `parsed_json/spread.json` |
| `rule605-monthly.mjs` | US effective spreads, `parsed_json/rule605-monthly.json` |
| `rule606.mjs` | Where US broker-dealers send orders. Q is computed, not stored |
| `prices.mjs` | Last close per ISIN, `parsed_json/prices.json`, so a percent fee can become money |
| `taxes.mjs`, `taxMap.mjs` | Stamp and transaction taxes by ISIN |
| `fx.mjs` | Mid rates into dollars |
| `accepted.mjs` | Countries a broker will open an account for |
| `deposits.mjs` | Currencies an account can hold without converting |

Catalogues (`*-parsed.json`) are not committed. `parsed_json/` holds the shared books, prices, taxes, and the 605 and 606 tables.

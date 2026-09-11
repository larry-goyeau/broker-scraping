// Missing stays missing. The front prints N/A so a hole reads as a hole,
// not as a free trade.
//
//   x + N/A = N/A
//   x × N/A = N/A

export function plus(...xs) {
  let s = 0;
  for (const x of xs) {
    if (x == null || Number.isNaN(x)) return null;
    s += x;
  }
  return s;
}

export function times(...xs) {
  let p = 1;
  for (const x of xs) {
    if (x == null || Number.isNaN(x)) return null;
    p *= x;
  }
  return p;
}

export function finite(x, digits) {
  if (x == null || Number.isNaN(x)) return null;
  return Number(Number(x).toPrecision(digits));
}

// Market contribution to `a` (fraction of the amount) and `b` (USD / share).
// A missing book is null, not 0: N/A + x = N/A, including a named gap
// (Stuttgart, …) and a sourced place with no leaf. The US tape has no %
// book, so `a` stays 0 there; a missing 605 leaf makes `b` null instead.
// Crypto is OTC without a single tape: there is no book to add, so `a` is 0
// and the broker's published % is the cost, not N/A.
export function bookParts({ bp, perShare, venue, unsourced, toUsd }) {
  const us = venue?.source === "us605";
  const crypto = Boolean(unsourced?.match?.includes("crypto"));

  const a = bp != null ? bp / 1e4 : us || crypto ? 0 : null;

  let b;
  if (perShare != null) {
    b = toUsd ? toUsd(perShare) : perShare;
    if (b == null || Number.isNaN(b)) b = null;
  } else if (us) {
    b = null;
  } else if (bp != null || crypto) {
    // Book is in `a`, or there is no tape (crypto OTC).
    b = 0;
  } else {
    // No leaf at all: do not print 0 next to an N/A `a`.
    b = null;
  }

  return { a, b };
}

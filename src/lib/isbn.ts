// ISBN helpers. Book barcodes are EAN-13 codes starting with 978 or 979 ("Bookland").

const digitsOnly = (s: string) => s.replace(/[^0-9Xx]/g, '').toUpperCase();

export function isValidIsbn13(code: string): boolean {
  if (!/^97[89][0-9]{10}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

export function isValidIsbn10(code: string): boolean {
  if (!/^[0-9]{9}[0-9X]$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = code[i] === 'X' ? 10 : Number(code[i]);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

export function isbn10to13(isbn10: string): string {
  const core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return core + ((10 - (sum % 10)) % 10);
}

export type IsbnResult =
  | { ok: true; isbn13: string }
  | { ok: false; reason: 'not_a_book_code' | 'invalid' };

/** Turn a scanned or typed code into a valid ISBN-13, if possible. */
export function normalizeIsbn(raw: string): IsbnResult {
  const code = digitsOnly(raw);
  if (code.length === 13) {
    if (!code.startsWith('978') && !code.startsWith('979')) return { ok: false, reason: 'not_a_book_code' };
    return isValidIsbn13(code) ? { ok: true, isbn13: code } : { ok: false, reason: 'invalid' };
  }
  if (code.length === 10) {
    return isValidIsbn10(code) ? { ok: true, isbn13: isbn10to13(code) } : { ok: false, reason: 'invalid' };
  }
  // 12-digit UPC (e.g. price code on mass-market paperbacks), EAN-8, 5-digit price add-ons, etc.
  return { ok: false, reason: 'not_a_book_code' };
}

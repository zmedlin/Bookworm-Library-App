// Look up book details from an ISBN using free public APIs.
// Open Library first, Google Books as a fallback.

export type BookInfo = {
  title: string;
  authors: string[];
  publisher: string | null;
  published_year: number | null;
  cover_url: string | null;
};

const yearFrom = (s?: string | null): number | null => {
  const m = s?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return m ? Number(m[1]) : null;
};

const https = (u?: string | null) => (u ? u.replace(/^http:\/\//, 'https://') : null);

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fromOpenLibrary(isbn13: string): Promise<BookInfo | null> {
  const data = await fetchJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`,
  );
  const b = data?.[`ISBN:${isbn13}`];
  if (!b?.title) return null;
  return {
    title: b.subtitle ? `${b.title}: ${b.subtitle}` : b.title,
    authors: (b.authors ?? []).map((a: any) => a.name).filter(Boolean),
    publisher: b.publishers?.[0]?.name ?? null,
    published_year: yearFrom(b.publish_date),
    cover_url: https(b.cover?.medium ?? b.cover?.large ?? b.cover?.small),
  };
}

async function fromGoogleBooks(isbn13: string): Promise<BookInfo | null> {
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}`);
  const v = data?.items?.[0]?.volumeInfo;
  if (!v?.title) return null;
  return {
    title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title,
    authors: v.authors ?? [],
    publisher: v.publisher ?? null,
    published_year: yearFrom(v.publishedDate),
    cover_url: https(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail),
  };
}

export async function lookupIsbn(isbn13: string): Promise<BookInfo | null> {
  const ol = await fromOpenLibrary(isbn13);
  if (ol && ol.authors.length && ol.cover_url) return ol;
  const gb = await fromGoogleBooks(isbn13);
  if (!ol) return gb;
  if (!gb) return ol;
  // Fill gaps in the Open Library record with Google Books data.
  return {
    title: ol.title,
    authors: ol.authors.length ? ol.authors : gb.authors,
    publisher: ol.publisher ?? gb.publisher,
    published_year: ol.published_year ?? gb.published_year,
    cover_url: ol.cover_url ?? gb.cover_url,
  };
}

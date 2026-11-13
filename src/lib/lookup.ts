// Look up book details from an ISBN using free public APIs.
// Open Library first, Google Books as a fallback.
import { isbn13to10 } from './isbn';

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

// ---------- Amazon ----------
// Amazon has no free official cover API; this long-standing (undocumented) image address
// works for most ISBN-10s and returns a 1×1 placeholder when there's no cover.

const amazonUrl = (isbn10: string) => `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`;

/** Amazon cover URLs for a set of ISBNs (10 or 13 digits). Not checked; tiny placeholders are filtered when shown. */
export function amazonCoverUrls(isbns: string[]): string[] {
  const tens = isbns.map((i) => (i.length === 10 ? i.toUpperCase() : isbn13to10(i))).filter(Boolean) as string[];
  return [...new Set(tens)].map(amazonUrl);
}

/** Amazon's cover for one ISBN, only if a real image exists (not the placeholder). */
async function amazonCoverByIsbn(isbn13: string): Promise<string | null> {
  const [url] = amazonCoverUrls([isbn13]);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
    const bytes = (await res.arrayBuffer()).byteLength;
    return bytes > 1000 ? url : null; // the placeholder is a ~43-byte GIF
  } catch {
    return null;
  }
}

/** Open Library's cover-by-ISBN image, if one exists. */
async function openLibraryCoverByIsbn(isbn13: string): Promise<string | null> {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg?default=false`;
  try {
    const res = await fetch(url);
    return res.ok ? url.replace('?default=false', '') : null;
  } catch {
    return null;
  }
}

export async function lookupIsbn(isbn13: string): Promise<BookInfo | null> {
  const ol = await fromOpenLibrary(isbn13);
  let info: BookInfo | null = ol;
  if (!ol || !ol.authors.length || !ol.cover_url) {
    const gb = await fromGoogleBooks(isbn13);
    if (!ol) info = gb;
    else if (gb)
      // Fill gaps in the Open Library record with Google Books data.
      info = {
        title: ol.title,
        authors: ol.authors.length ? ol.authors : gb.authors,
        publisher: ol.publisher ?? gb.publisher,
        published_year: ol.published_year ?? gb.published_year,
        cover_url: ol.cover_url ?? gb.cover_url,
      };
  }
  if (info && !info.cover_url) info.cover_url = (await openLibraryCoverByIsbn(isbn13)) ?? (await amazonCoverByIsbn(isbn13));
  return info;
}

/** "Dune: Deluxe Edition (Penguin Classics)" → "Dune" — searches match far better on the main title. */
export const mainTitle = (title: string) => title.split(/[:(\[]/)[0].replace(/\s+/g, ' ').trim() || title.trim();

const olCover = (id: number) => `https://covers.openlibrary.org/b/id/${id}-M.jpg`;

/** Covers (and ISBNs) from every edition of an Open Library work (e.g. "/works/OL45804W"). */
async function openLibraryWorkCovers(workKey: string): Promise<{ covers: string[]; isbns: string[] }> {
  const [work, editions] = await Promise.all([
    fetchJson(`https://openlibrary.org${workKey}.json`),
    fetchJson(`https://openlibrary.org${workKey}/editions.json?limit=100`),
  ]);
  const ids: number[] = [...(work?.covers ?? [])];
  const isbns: string[] = [];
  for (const e of editions?.entries ?? []) {
    ids.push(...(e.covers ?? []));
    isbns.push(...(e.isbn_10 ?? []), ...(e.isbn_13 ?? []));
  }
  return { covers: [...new Set(ids.filter((id) => id > 0))].map(olCover), isbns };
}

/** The Open Library work that an ISBN belongs to. */
async function openLibraryWorkForIsbn(isbn13: string): Promise<string | null> {
  const ed = await fetchJson(`https://openlibrary.org/isbn/${isbn13}.json`);
  return ed?.works?.[0]?.key ?? null;
}

/** Open Library search: returns work keys and their main cover. */
async function openLibrarySearch(title: string, author: string): Promise<{ works: string[]; covers: string[] }> {
  const q = new URLSearchParams({ title, fields: 'key,cover_i', limit: '10' });
  if (author) q.set('author', author);
  const d = await fetchJson(`https://openlibrary.org/search.json?${q}`);
  const docs: any[] = d?.docs ?? [];
  return {
    works: docs.map((x) => x.key).filter(Boolean),
    covers: docs.filter((x) => x.cover_i > 0).map((x) => olCover(x.cover_i)),
  };
}

async function googleCovers(title: string, author: string): Promise<string[]> {
  const q = `intitle:"${title}"` + (author ? ` inauthor:"${author}"` : '');
  const d = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=30&printType=books`,
  );
  const out: string[] = [];
  for (const item of d?.items ?? []) {
    const l = item.volumeInfo?.imageLinks;
    const u = l?.thumbnail ?? l?.smallThumbnail;
    if (u) out.push(u.replace('&edge=curl', ''));
  }
  return out;
}

/** Apple Books (iTunes Search API, free, no key). Covers are upsized to 600px. */
async function appleCovers(title: string, author: string): Promise<string[]> {
  const term = encodeURIComponent(`${title} ${author}`.trim());
  const d = await fetchJson(`https://itunes.apple.com/search?term=${term}&media=ebook&entity=ebook&limit=25`);
  const t = title.toLowerCase();
  return (d?.results ?? [])
    .filter((r: any) => r.artworkUrl100 && String(r.trackName ?? '').toLowerCase().includes(t))
    .map((r: any) => String(r.artworkUrl100).replace(/\/\d+x\d+bb\./, '/600x900bb.'));
}

/**
 * Search online for possible covers: every Open Library edition of the book,
 * Apple Books, and Google Books. Best guesses first.
 */
export async function findCovers(opts: { isbn13?: string | null; title: string; author?: string }): Promise<string[]> {
  const title = mainTitle(opts.title);
  const author = (opts.author ?? '').trim();
  const lastName = author.split(/\s+/).pop() ?? '';

  const [isbnCover, isbnWork, search, apple, google] = await Promise.all([
    opts.isbn13 ? openLibraryCoverByIsbn(opts.isbn13) : Promise.resolve(null),
    opts.isbn13 ? openLibraryWorkForIsbn(opts.isbn13) : Promise.resolve(null),
    title ? openLibrarySearch(title, author) : Promise.resolve({ works: [], covers: [] }),
    title ? appleCovers(title, author) : Promise.resolve([]),
    title ? googleCovers(title, author) : Promise.resolve([]),
  ]);

  // Editions of the matching work(s): the richest source of alternative covers.
  const workKeys = [...new Set([isbnWork, ...search.works.slice(0, 2)].filter(Boolean) as string[])];
  const works = await Promise.all(workKeys.map(openLibraryWorkCovers));
  const editionCovers = works.flatMap((w) => w.covers);
  // Amazon: this book's ISBN first, then other editions' ISBNs.
  const amazon = amazonCoverUrls([...(opts.isbn13 ? [opts.isbn13] : []), ...works.flatMap((w) => w.isbns)]).slice(0, 20);

  let more: string[] = [];
  const soFar = new Set([isbnCover, ...editionCovers, ...search.covers, ...apple, ...google].filter(Boolean));
  if (soFar.size < 6 && title) {
    // Loosen up: title only, or title + last name.
    const [a, b] = await Promise.all([
      openLibrarySearch(title, '').then((r) => r.covers),
      googleCovers(title, lastName !== author ? lastName : ''),
    ]);
    more = [...a, ...b];
  }

  const urls: string[] = [];
  for (const u of [isbnCover, ...amazon.slice(0, 1), ...apple.slice(0, 4), ...editionCovers, ...amazon.slice(1), ...search.covers, ...google, ...apple.slice(4), ...more]) {
    const h = https(u);
    if (h && !urls.includes(h)) urls.push(h);
  }
  return urls.slice(0, 80);
}

/** Opens a Google Images search for the book in the phone's browser. */
export const webImageSearchUrl = (title: string, author: string) =>
  `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${mainTitle(title)} ${author} book cover`.trim())}`;

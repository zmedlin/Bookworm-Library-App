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
  if (info && !info.cover_url) info.cover_url = await openLibraryCoverByIsbn(isbn13);
  return info;
}

/**
 * Search online for possible covers (other editions, other sources).
 * Returns image URLs, best guesses first.
 */
export async function findCovers(opts: { isbn13?: string | null; title: string; author?: string }): Promise<string[]> {
  const title = opts.title.trim();
  const author = (opts.author ?? '').trim();
  const urls: string[] = [];
  const add = (u?: string | null) => {
    const h = https(u);
    if (h && !urls.includes(h)) urls.push(h);
  };

  const tasks: Promise<void>[] = [];
  if (opts.isbn13) tasks.push(openLibraryCoverByIsbn(opts.isbn13).then(add));

  if (title) {
    const q = new URLSearchParams({ title, fields: 'cover_i', limit: '15' });
    if (author) q.set('author', author);
    tasks.push(
      fetchJson(`https://openlibrary.org/search.json?${q}`).then((d) => {
        for (const doc of d?.docs ?? []) if (doc.cover_i > 0) add(`https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`);
      }),
    );
    const g = `intitle:${title}` + (author ? `+inauthor:${author}` : '');
    tasks.push(
      fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(g)}&maxResults=20`).then((d) => {
        for (const item of d?.items ?? []) {
          const l = item.volumeInfo?.imageLinks;
          add((l?.thumbnail ?? l?.smallThumbnail)?.replace('&edge=curl', ''));
        }
      }),
    );
  }
  await Promise.all(tasks);
  return urls.slice(0, 30);
}

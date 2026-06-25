import { getValidAccessToken } from "./yoto-auth";

const NOISE_WORDS = new Set([
  "official", "video", "audio", "lyrics", "lyric", "hd", "4k", "full", "song",
  "ft", "feat", "remastered", "remix", "version", "original", "soundtrack",
]);

/** Strips bracketed tags and common noise words, leaving a short search phrase. */
export function deriveSearchKeyword(title: string): string {
  const noBrackets = title.replace(/[([{][^)\]}]*[)\]}]/g, " ");
  const words = noBrackets
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE_WORDS.has(w.toLowerCase()));
  return words.slice(0, 3).join(" ") || title;
}

export interface IconCandidate {
  url: string;
  source: "yotoicons" | "yoto-library";
  id: string;
  mediaId?: string;
}

const MODAL_CALL = /populate_icon_modal\('(\d+)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'(\d+)'\)/g;

/** Scrapes yotoicons.com's tag/search results page. No public API exists — best-effort, never throws. */
async function searchYotoIcons(keyword: string): Promise<IconCandidate[]> {
  try {
    const res = await fetch(`https://www.yotoicons.com/icons?tag=${encodeURIComponent(keyword)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; yotube/1.0)" },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: { id: string; downloads: number }[] = [];
    for (const match of html.matchAll(MODAL_CALL)) {
      const [, id, , , , , downloads] = match;
      results.push({ id, downloads: Number(downloads) || 0 });
    }
    results.sort((a, b) => b.downloads - a.downloads);
    return results.map((r) => ({
      url: `https://www.yotoicons.com/static/uploads/${r.id}.png`,
      source: "yotoicons" as const,
      id: r.id,
    }));
  } catch {
    return [];
  }
}

interface OfficialIcon {
  mediaId: string;
  title: string;
  url: string;
  publicTags: string[];
}

let officialLibraryCache: OfficialIcon[] | undefined;

async function getOfficialIconLibrary(): Promise<OfficialIcon[]> {
  if (officialLibraryCache) return officialLibraryCache;
  try {
    const accessToken = await getValidAccessToken();
    const res = await fetch("https://api.yotoplay.com/media/displayIcons/user/yoto", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const body = await res.json();
    officialLibraryCache = body.displayIcons ?? [];
    return officialLibraryCache!;
  } catch {
    return [];
  }
}

async function searchOfficialLibrary(keyword: string): Promise<IconCandidate[]> {
  const library = await getOfficialIconLibrary();
  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = library.filter((icon) =>
    words.some(
      (w) =>
        icon.title.toLowerCase().includes(w) ||
        icon.publicTags.some((tag) => tag.toLowerCase().includes(w)),
    ),
  );
  return matches.map((icon) => ({
    url: icon.url,
    source: "yoto-library" as const,
    id: icon.mediaId,
    mediaId: icon.mediaId,
  }));
}

/** Generic terms to fall back to when nothing matches the actual title, so a track is never left without an icon. */
const FALLBACK_TERMS = ["music", "note", "video", "play"];

async function findFallbackIcon(): Promise<IconCandidate | undefined> {
  for (const term of FALLBACK_TERMS) {
    const fromYotoIcons = await searchYotoIcons(term);
    if (fromYotoIcons.length > 0) return fromYotoIcons[0];
    const fromLibrary = await searchOfficialLibrary(term);
    if (fromLibrary.length > 0) return fromLibrary[0];
  }
  return undefined;
}

/** Finds icon candidates for a track title: yotoicons.com first, official Yoto library as fallback.
 *  Pass `keywordOverride` to search by an explicit word/phrase instead of deriving one from the title.
 *  Never throws. */
export async function findIconCandidates(title: string, keywordOverride?: string): Promise<IconCandidate[]> {
  const keyword = keywordOverride?.trim() || deriveSearchKeyword(title);
  const words = keyword.split(/\s+/).filter(Boolean);

  let candidates = await searchYotoIcons(keyword);
  if (candidates.length === 0) {
    for (const word of words) {
      if (word === keyword) continue;
      candidates = await searchYotoIcons(word);
      if (candidates.length > 0) break;
    }
  }
  if (candidates.length === 0) {
    candidates = await searchOfficialLibrary(keyword);
  }
  if (candidates.length === 0) {
    for (const word of words) {
      candidates = await searchOfficialLibrary(word);
      if (candidates.length > 0) break;
    }
  }
  return candidates;
}

/** Picks one icon for a track, excluding ids already shown (for the "regenerate"/swap action). Pass
 *  `keyword` to search by an explicit word/phrase instead of deriving one from the title. Always
 *  returns something — falls back to a generic icon when nothing matches at all. */
export async function pickIcon(
  title: string,
  excludeIds: string[] = [],
  keyword?: string,
): Promise<IconCandidate | undefined> {
  const candidates = await findIconCandidates(title, keyword);
  const fresh = candidates.filter((c) => !excludeIds.includes(c.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  if (pool.length === 0) return findFallbackIcon();
  const topPool = pool.slice(0, 5);
  return topPool[Math.floor(Math.random() * topPool.length)];
}

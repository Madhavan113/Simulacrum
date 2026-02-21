export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchConfig {
  provider?: "tavily" | "brave";
  apiKey?: string;
  cacheTtlMs?: number;
}

interface CachedSearch {
  results: SearchResult[];
  fetchedAt: number;
}

const cache = new Map<string, CachedSearch>();
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

export async function searchWeb(
  query: string,
  config: WebSearchConfig,
  maxResults = 5
): Promise<SearchResult[]> {
  if (!config.apiKey) {
    return [];
  }

  const provider = config.provider ?? "tavily";
  const ttl = config.cacheTtlMs ?? DEFAULT_CACHE_TTL;
  const cacheKey = `${provider}:${query.toLowerCase().trim()}`;

  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < ttl) {
    return cached.results;
  }

  try {
    const results =
      provider === "brave"
        ? await braveFetch(query, config.apiKey, maxResults)
        : await tavilyFetch(query, config.apiKey, maxResults);

    cache.set(cacheKey, { results, fetchedAt: Date.now() });
    pruneCache(30);

    return results;
  } catch (err) {
    console.warn(
      `[web-search] ${provider} failed: ${err instanceof Error ? err.message : err}`
    );

    if (cached) {
      return cached.results;
    }

    return [];
  }
}

async function tavilyFetch(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false
    })
  });

  if (!res.ok) {
    throw new Error(`Tavily HTTP ${res.status}`);
  }

  const body = (await res.json()) as {
    results?: Array<{ title?: string; content?: string; url?: string }>;
  };

  return (body.results ?? []).map((r) => ({
    title: r.title ?? "",
    snippet: (r.content ?? "").slice(0, 250),
    url: r.url ?? ""
  }));
}

async function braveFetch(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, count: String(maxResults) });
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey
      }
    }
  );

  if (!res.ok) {
    throw new Error(`Brave HTTP ${res.status}`);
  }

  const body = (await res.json()) as {
    web?: {
      results?: Array<{
        title?: string;
        description?: string;
        url?: string;
      }>;
    };
  };

  return (body.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    snippet: (r.description ?? "").slice(0, 250),
    url: r.url ?? ""
  }));
}

function pruneCache(maxSize: number): void {
  if (cache.size <= maxSize) {
    return;
  }

  const sorted = [...cache.entries()].sort(
    (a, b) => a[1].fetchedAt - b[1].fetchedAt
  );
  const toRemove = sorted.slice(0, cache.size - maxSize);

  for (const [key] of toRemove) {
    cache.delete(key);
  }
}

/**
 * Format search results as a compact multi-line string suitable for LLM context.
 */
export function formatSearchContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return "";
  }

  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`)
    .join("\n");
}

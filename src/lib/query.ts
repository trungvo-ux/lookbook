/**
 * Conversational query understanding for Lookbook search.
 * Normalizes phrasing like "find me a dashboard design" → ranked terms + intent.
 */

export type QueryIntent =
  | "product-ui"
  | "landing"
  | "mobile-flow"
  | "moodboard"
  | "motion"
  | "general";

export interface UnderstoodQuery {
  raw: string;
  normalized: string;
  /** Primary search terms after stopword removal + singularization */
  terms: string[];
  /** Expanded synonyms useful for matching titles/tags/URLs */
  expandedTerms: string[];
  intent: QueryIntent;
  /** Whether to prefer product/UI priority sources (Mobbin, etc.) */
  preferProductSources: boolean;
  /** Mobbin screen-pattern slugs to try */
  mobbinPatterns: string[];
  /** Curated.design inspiration category slugs */
  curatedCategories: string[];
  /** Awwwards websites category slugs */
  awwwardsCategories: string[];
  /** 60fps filter / shot slug hints */
  sixtyfpsHints: string[];
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "me",
  "my",
  "i",
  "im",
  "i'm",
  "find",
  "show",
  "get",
  "give",
  "need",
  "want",
  "looking",
  "for",
  "some",
  "any",
  "good",
  "great",
  "best",
  "cool",
  "nice",
  "please",
  "hey",
  "inspo",
  "lookbook",
  "inspiration",
  "design",
  "designs",
  "example",
  "examples",
  "ui",
  "ux",
  "like",
  "of",
  "to",
  "and",
  "or",
  "with",
  "from",
  "on",
  "in",
  "into",
  "about",
]);

const SYNONYMS: Record<string, string[]> = {
  dashboard: ["dashboard", "admin", "analytics", "metrics", "stats", "overview", "panel", "console"],
  dashboards: ["dashboard", "admin", "analytics", "metrics", "stats", "overview"],
  settings: ["settings", "preferences", "account", "profile", "configuration"],
  onboarding: ["onboarding", "welcome", "get-started", "signup", "walkthrough", "tutorial"],
  landing: ["landing", "homepage", "marketing", "hero", "saas"],
  mobile: ["mobile", "ios", "android", "app"],
  flow: ["flow", "flows", "journey", "funnel"],
  checkout: ["checkout", "payment", "cart", "billing"],
  pricing: ["pricing", "plans", "paywall", "subscription"],
  empty: ["empty", "empty-state", "blank"],
  chart: ["chart", "charts", "graph", "graphs", "analytics"],
  charts: ["chart", "charts", "graph", "graphs", "analytics"],
  home: ["home", "homepage", "feed", "main"],
  nav: ["nav", "navbar", "navigation", "menu"],
  footer: ["footer"],
  cta: ["cta", "call-to-action", "button"],
  dark: ["dark", "dark-mode", "noir"],
  saas: ["saas", "b2b", "startup", "product"],
  portfolio: ["portfolio", "agency", "studio"],
  ecommerce: ["ecommerce", "e-commerce", "shop", "store", "storefront"],
};

const PRODUCT_UI_TERMS = new Set([
  "dashboard",
  "settings",
  "onboarding",
  "checkout",
  "pricing",
  "empty",
  "chart",
  "charts",
  "analytics",
  "mobile",
  "flow",
  "flows",
  "app",
  "saas",
  "admin",
  "account",
  "profile",
  "feed",
  "search",
  "modal",
  "table",
  "form",
  "login",
  "signup",
  "paywall",
  "subscription",
  "billing",
  "notifications",
  "inbox",
  "kanban",
  "calendar",
]);

function singularize(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

function tokenize(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s/-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function expand(terms: string[]): string[] {
  const out = new Set<string>();
  for (const t of terms) {
    out.add(t);
    out.add(singularize(t));
    const syns = SYNONYMS[t] || SYNONYMS[singularize(t)];
    if (syns) syns.forEach((s) => out.add(s));
  }
  return [...out];
}

function detectIntent(terms: string[], raw: string): QueryIntent {
  const joined = `${raw} ${terms.join(" ")}`.toLowerCase();
  if (/motion|animat|micro-?interaction|60\s*fps|hover/.test(joined)) return "motion";
  if (/landing|hero|marketing|homepage|saas\s+page/.test(joined)) return "landing";
  if (/moodboard|aesthetic|visual\s+inspo|color\s+palett/.test(joined)) return "moodboard";
  if (/mobile|ios|android|onboarding|flow|app\s+screen/.test(joined)) return "mobile-flow";
  if (terms.some((t) => PRODUCT_UI_TERMS.has(t) || PRODUCT_UI_TERMS.has(singularize(t)))) {
    return "product-ui";
  }
  return "general";
}

const MOBBIN_PATTERN_MAP: Array<{ pattern: string; match: RegExp }> = [
  { pattern: "dashboard", match: /dashboard|admin|analytics|overview|metrics|stats/ },
  { pattern: "settings-preferences", match: /settings|preferences|config/ },
  { pattern: "welcome-get-started", match: /onboarding|welcome|get[- ]started|walkthrough/ },
  { pattern: "charts", match: /chart|graph|analytics|metrics/ },
  { pattern: "home", match: /\bhome\b|homepage|feed/ },
  { pattern: "empty-state", match: /empty/ },
  { pattern: "pricing", match: /pricing|plans|paywall/ },
  { pattern: "subscription-paywall", match: /subscription|paywall/ },
  { pattern: "checkout", match: /checkout|cart|payment/ },
  { pattern: "browse-discover", match: /browse|discover|explore/ },
  { pattern: "calendar", match: /calendar|schedule/ },
  { pattern: "search", match: /\bsearch\b/ },
  { pattern: "social-feed", match: /feed|social/ },
  { pattern: "product-detail", match: /product\s*detail|pdp/ },
  { pattern: "account-setup", match: /account|signup|sign-up/ },
  { pattern: "loading", match: /loading|skeleton/ },
  { pattern: "internal-tool", match: /internal[- ]tool/ },
];

const CURATED_CATEGORY_MAP: Array<{ slug: string; match: RegExp }> = [
  { slug: "web-apps", match: /dashboard|saas|product|web\s*app|admin|tool/ },
  { slug: "productivity", match: /dashboard|productivity|workspace|notion|saas/ },
  { slug: "desktop-apps", match: /dashboard|desktop|app/ },
  { slug: "finance", match: /finance|fintech|bank|trading|invest/ },
  { slug: "mobile-apps", match: /mobile|ios|android/ },
  { slug: "portfolio", match: /portfolio|agency|studio/ },
  { slug: "shops", match: /shop|store|ecommerce|e-commerce/ },
  { slug: "artificial-intelligence", match: /\bai\b|artificial/ },
  { slug: "marketing", match: /marketing|landing|campaign/ },
  { slug: "minimal", match: /minimal|clean/ },
  { slug: "tech", match: /tech|software|developer/ },
];

const AWWWARDS_CATEGORY_MAP: Array<{ slug: string; match: RegExp }> = [
  { slug: "dashboard", match: /dashboard|admin|analytics/ },
  { slug: "ui-design", match: /ui|product|interface|app/ },
  { slug: "mobile-apps", match: /mobile|ios|android|app/ },
  { slug: "e-commerce", match: /ecommerce|e-commerce|shop|store/ },
  { slug: "portfolio", match: /portfolio|agency/ },
  { slug: "interaction-design", match: /interaction|motion|animation|hover/ },
  { slug: "single-page", match: /landing|single\s*page|one\s*page/ },
  { slug: "business-corporate", match: /saas|b2b|business|corporate/ },
];

const SIXTYFPS_HINT_MAP: Array<{ hint: string; match: RegExp }> = [
  { hint: "graph", match: /dashboard|chart|graph|analytics|metrics|stats/ },
  { hint: "onboarding", match: /onboarding|welcome|get[- ]started/ },
  { hint: "empty", match: /empty/ },
  { hint: "loading", match: /loading|skeleton/ },
  { hint: "settings", match: /settings|preferences/ },
  { hint: "navigation", match: /nav|navigation|menu|tab/ },
  { hint: "pricing", match: /pricing|paywall|plans/ },
  { hint: "search", match: /\bsearch\b/ },
  { hint: "calendar", match: /calendar|schedule/ },
  { hint: "home", match: /\bhome\b|homepage/ },
];

export function understandQuery(raw: string): UnderstoodQuery {
  const normalized = raw.trim().replace(/\s+/g, " ");
  const tokens = tokenize(normalized);
  const terms = tokens
    .filter((t) => !STOPWORDS.has(t) && t.length > 1)
    .map(singularize);
  // Keep at least something usable
  const effectiveTerms = terms.length ? terms : tokens.filter((t) => t.length > 2).slice(0, 4);
  const expandedTerms = expand(effectiveTerms.length ? effectiveTerms : ["design"]);
  const intent = detectIntent(effectiveTerms, normalized);
  const hay = `${normalized} ${expandedTerms.join(" ")}`.toLowerCase();

  const mobbinPatterns = MOBBIN_PATTERN_MAP.filter((m) => m.match.test(hay)).map(
    (m) => m.pattern,
  );
  const curatedCategories = CURATED_CATEGORY_MAP.filter((m) => m.match.test(hay)).map(
    (m) => m.slug,
  );
  const awwwardsCategories = AWWWARDS_CATEGORY_MAP.filter((m) => m.match.test(hay)).map(
    (m) => m.slug,
  );
  const sixtyfpsHints = SIXTYFPS_HINT_MAP.filter((m) => m.match.test(hay)).map(
    (m) => m.hint,
  );

  const preferProductSources =
    intent === "product-ui" ||
    intent === "mobile-flow" ||
    mobbinPatterns.length > 0 ||
    effectiveTerms.some((t) => PRODUCT_UI_TERMS.has(t));

  return {
    raw,
    normalized,
    terms: effectiveTerms,
    expandedTerms,
    intent,
    preferProductSources,
    mobbinPatterns: mobbinPatterns.length ? mobbinPatterns : preferProductSources ? ["dashboard"] : [],
    curatedCategories: curatedCategories.length
      ? curatedCategories
      : preferProductSources
        ? ["web-apps", "productivity"]
        : ["web-apps"],
    awwwardsCategories: awwwardsCategories.length
      ? awwwardsCategories
      : preferProductSources
        ? ["ui-design"]
        : [],
    sixtyfpsHints: sixtyfpsHints.length ? sixtyfpsHints : intent === "motion" ? ["onboarding"] : [],
  };
}

/** Score how well an item matches an understood query (higher is better). */
export function scoreAgainstQuery(
  item: {
    title: string;
    description?: string;
    tags: string[];
    url: string;
    thumbnailUrl?: string;
    sourceId: string;
  },
  q: UnderstoodQuery,
): number {
  const title = item.title.toLowerCase();
  const tags = item.tags.join(" ").toLowerCase();
  const desc = (item.description || "").toLowerCase();
  const url = item.url.toLowerCase();
  let score = 0;

  for (const t of q.terms) {
    if (title.includes(t)) score += 8;
    if (tags.includes(t)) score += 5;
    if (url.includes(t)) score += 4;
    if (desc.includes(t)) score += 2;
  }
  for (const t of q.expandedTerms) {
    if (q.terms.includes(t)) continue;
    if (title.includes(t)) score += 4;
    if (tags.includes(t)) score += 3;
    if (url.includes(t)) score += 2;
    if (desc.includes(t)) score += 1;
  }

  if (item.thumbnailUrl) score += 1.5;

  // Source priority boosts for product UI queries
  const sourceBoost: Record<string, number> = {
    mobbin: q.preferProductSources ? 3 : 1,
    godly: 1.5,
    "minimal-gallery": 1.2,
    cosmos: q.intent === "moodboard" ? 2 : 0.8,
    awwwards: 1.3,
    "curated-design": 1.2,
    "60fps": q.intent === "motion" ? 2.5 : 1,
  };
  score += sourceBoost[item.sourceId] ?? 0;

  return score;
}

/** Priority source ids for fan-out search (order matters for tie-breaks). */
export const PRIORITY_SEARCH_SOURCES = [
  "mobbin",
  "godly",
  "minimal-gallery",
  "cosmos",
  "awwwards",
  "curated-design",
  "60fps",
] as const;

export function pickSearchSources(
  q: UnderstoodQuery,
  explicit?: string[],
): string[] {
  if (explicit?.length) return explicit;
  if (q.preferProductSources || q.intent === "mobile-flow" || q.intent === "product-ui") {
    return [...PRIORITY_SEARCH_SOURCES];
  }
  if (q.intent === "motion") {
    return ["60fps", "awwwards", "godly", "cosmos", "minimal-gallery", "mobbin", "curated-design"];
  }
  if (q.intent === "landing") {
    return ["godly", "awwwards", "curated-design", "minimal-gallery", "cosmos", "mobbin", "60fps"];
  }
  if (q.intent === "moodboard") {
    return ["cosmos", "godly", "minimal-gallery", "curated-design", "awwwards", "mobbin", "60fps"];
  }
  return [...PRIORITY_SEARCH_SOURCES];
}

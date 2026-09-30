export type SourceCategory =
  | "mobile"
  | "web"
  | "component"
  | "moodboard"
  | "tool"
  | "other";

export interface InspoSource {
  id: string;
  name: string;
  homeUrl: string;
  category: SourceCategory;
  description: string;
  /** Dedicated HTML extractor exists for gallery + detail pages */
  hasDedicatedFetcher: boolean;
  /** Optional URL used for gallery browsing when different from home */
  browseUrl?: string;
  /** Domains this source owns (for URL → source resolution) */
  domains: string[];
}

export interface InspoItem {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  imageUrls: string[];
  tags: string[];
  category?: string;
  description?: string;
  author?: string;
  publishedAt?: string;
  rawExcerpt?: string;
  fetchedAt: string;
}

export type InspoPage = InspoItem;

export interface BrowseResult {
  sourceId: string;
  query?: string;
  items: InspoItem[];
  fetchedAt: string;
  note?: string;
}

export interface SearchResult {
  query: string;
  items: InspoItem[];
  fetchedAt: string;
  notes: string[];
}

export interface ReviewBrief {
  urls: string[];
  pages: InspoPage[];
  brief: {
    visualStyleTags: string[];
    layoutNotes: string[];
    typographyColorCues: string[];
    interactionNotes: string[];
    whyInspire: string[];
    caveats: string[];
  };
  fetchedAt: string;
}

import type { InspoPage, ReviewBrief } from "../types/inspo.js";
import { getInspoPage } from "../fetchers/index.js";
import { nowIso } from "../lib/http.js";

const STYLE_LEXICON: Array<{ tag: string; patterns: RegExp[] }> = [
  { tag: "dark-mode", patterns: [/dark\s*mode/i, /\bdark\b/i, /noir/i, /black\s+ui/i] },
  { tag: "minimal", patterns: [/minimal/i, /restrained/i, /clean\s+layout/i, /whitespace/i] },
  { tag: "brutalist", patterns: [/brutalist/i, /raw\s+typo/i] },
  { tag: "saas", patterns: [/saas/i, /b2b/i, /startup/i, /product\s+landing/i] },
  { tag: "portfolio", patterns: [/portfolio/i, /agency/i, /studio/i] },
  { tag: "mobile", patterns: [/mobile/i, /app\s+store/i, /ios/i, /android/i] },
  { tag: "editorial", patterns: [/editorial/i, /magazine/i, /serif/i] },
  { tag: "gradient", patterns: [/gradient/i, /mesh/i, /glow/i] },
  { tag: "illustration", patterns: [/illustrat/i, /3d\s+render/i, /isometric/i] },
  { tag: "typography-led", patterns: [/typograph/i, /type-led/i, /display\s+font/i] },
  { tag: "hero-focused", patterns: [/hero/i, /above\s+the\s+fold/i] },
  { tag: "component", patterns: [/nav(?:bar)?/i, /footer/i, /cta/i, /pricing/i, /faq/i] },
];

function haystack(page: InspoPage): string {
  return [
    page.title,
    page.description,
    page.rawExcerpt,
    page.category,
    ...page.tags,
    ...page.imageUrls.map((u) => u.split("/").pop() || ""),
  ]
    .filter(Boolean)
    .join(" \n ");
}

function inferStyleTags(pages: InspoPage[]): string[] {
  const tags = new Set<string>();
  for (const page of pages) {
    for (const t of page.tags) {
      if (t.length > 1 && t.length < 32) tags.add(t.toLowerCase());
    }
    const text = haystack(page);
    for (const entry of STYLE_LEXICON) {
      if (entry.patterns.some((p) => p.test(text))) tags.add(entry.tag);
    }
    // Image filename cues from Godly section shots
    if (page.imageUrls.some((u) => /hero-/i.test(u))) tags.add("hero-focused");
    if (page.imageUrls.some((u) => /pricing-/i.test(u))) tags.add("pricing-section");
    if (page.imageUrls.some((u) => /mobile/i.test(u))) tags.add("responsive-mobile");
    if (page.imageUrls.some((u) => /og-image|poster|thumbnail/i.test(u))) {
      tags.add("has-og-preview");
    }
  }
  return [...tags].slice(0, 24);
}

function layoutNotes(pages: InspoPage[]): string[] {
  const notes: string[] = [];
  for (const page of pages) {
    const imgs = page.imageUrls;
    const sections = imgs
      .map((u) => {
        const m = u.match(
          /(hero|pricing|faq|cta|footer|nav|desktop|mobile|og-image|thumbnail)/i,
        );
        return m?.[1]?.toLowerCase();
      })
      .filter(Boolean);
    if (sections.length) {
      notes.push(
        `${page.title}: captured section imagery includes ${[...new Set(sections)].join(", ")}.`,
      );
    } else if (imgs.length >= 3) {
      notes.push(
        `${page.title}: ${imgs.length} page images available for visual review (no section labels in URLs).`,
      );
    } else if (imgs.length) {
      notes.push(
        `${page.title}: limited imagery (${imgs.length}) — primarily OG/thumbnail preview.`,
      );
    } else {
      notes.push(
        `${page.title}: no fetchable images in HTML; use public URL ${page.url} for visual review.`,
      );
    }
  }
  return notes.slice(0, 12);
}

function typographyColorCues(pages: InspoPage[]): string[] {
  const cues: string[] = [];
  for (const page of pages) {
    const text = haystack(page);
    const found: string[] = [];
    if (/serif|editorial|magazine/i.test(text)) found.push("editorial/serif cues in copy");
    if (/mono|code|developer|git/i.test(text)) found.push("developer/product tone");
    if (/dark/i.test(text)) found.push("dark palette referenced in metadata");
    if (/minimal|clean|restrained/i.test(text)) found.push("minimal / restrained aesthetic");
    if (/gradient|colorful|vibrant/i.test(text)) found.push("colorful / gradient language");
    if (!found.length) {
      found.push(
        "No explicit type/color tokens in HTML — infer only from linked images at imageUrls.",
      );
    }
    cues.push(`${page.title}: ${found.join("; ")}`);
  }
  return cues.slice(0, 12);
}

function interactionNotes(pages: InspoPage[]): string[] {
  const notes: string[] = [];
  for (const page of pages) {
    const text = haystack(page);
    const bits: string[] = [];
    if (/micro-?interaction|hover|animation|motion|60\s*fps/i.test(text)) {
      bits.push("motion / interaction called out in text");
    }
    if (/cta|call to action|signup|subscribe/i.test(text)) {
      bits.push("CTA / conversion language present");
    }
    if (/onboarding|flow|screenshot/i.test(text)) {
      bits.push("flow / onboarding oriented");
    }
    if (page.imageUrls.some((u) => /hover|anim|gif|mp4/i.test(u))) {
      bits.push("media filenames suggest motion assets");
    }
    if (!bits.length) {
      bits.push(
        "No interaction specifics in fetched HTML — review live URL for motion.",
      );
    }
    notes.push(`${page.title}: ${bits.join("; ")}`);
  }
  return notes.slice(0, 12);
}

function whyInspire(pages: InspoPage[]): string[] {
  return pages.slice(0, 8).map((page) => {
    const tags = page.tags.slice(0, 6).join(", ") || "general UI";
    const thumb = page.thumbnailUrl
      ? "Has a real thumbnail/OG image for quick visual scanning."
      : "Metadata-only; open the URL for visuals.";
    return `${page.title} (${page.sourceId}): useful for ${tags}. ${thumb} Source: ${page.url}`;
  });
}

/**
 * Build an agent-ready review brief from one or more inspo page URLs.
 * Derived only from fetched metadata, alt text, tags, and page text —
 * never invents screenshots.
 */
export async function buildReviewBrief(urls: string[]): Promise<ReviewBrief> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (!unique.length) throw new Error("At least one URL is required");

  const pages: InspoPage[] = [];
  const caveats: string[] = [];

  for (const url of unique.slice(0, 10)) {
    try {
      pages.push(await getInspoPage({ url }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      caveats.push(`Failed to fetch ${url}: ${msg}`);
    }
  }

  if (!pages.length) {
    throw new Error(
      `Could not fetch any pages. ${caveats.join(" | ") || "Unknown error"}`,
    );
  }

  caveats.push(
    "Visual style tags and notes are inferred from fetched HTML metadata, tags, alt text, and image URLs — not from pixel analysis or invented screenshots.",
  );

  return {
    urls: unique,
    pages,
    brief: {
      visualStyleTags: inferStyleTags(pages),
      layoutNotes: layoutNotes(pages),
      typographyColorCues: typographyColorCues(pages),
      interactionNotes: interactionNotes(pages),
      whyInspire: whyInspire(pages),
      caveats,
    },
    fetchedAt: nowIso(),
  };
}

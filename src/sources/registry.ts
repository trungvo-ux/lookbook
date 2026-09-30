import type { InspoSource, SourceCategory } from "../types/inspo.js";

type Entry = Omit<InspoSource, "hasDedicatedFetcher"> & {
  hasDedicatedFetcher?: boolean;
};

const DEDICATED = new Set([
  "godly",
  "minimal-gallery",
  "cosmos",
  "60fps",
  "awwwards",
  "curated-design",
  "mobbin",
]);

/**
 * Full design-inspiration source registry.
 * Descriptions sourced from the user's curated list; home URLs resolved to
 * public canonical sites.
 * Dedicated fetchers: Godly, Minimal Gallery, Cosmos, 60fps, Awwwards,
 * Curated Design, Mobbin.
 */
const ENTRIES: Entry[] = [
  {
    id: "godly",
    name: "Godly",
    homeUrl: "https://godly.website",
    browseUrl: "https://godly.design/websites",
    category: "web",
    description:
      "Curated gallery of standout web, app, and visual design (godly.website; live gallery at godly.design).",
    domains: ["godly.website", "godly.design", "www.godly.design"],
  },
  {
    id: "60fps",
    name: "60fps",
    homeUrl: "https://60fps.design",
    browseUrl: "https://60fps.design/shots/filter",
    category: "web",
    description: "Recordings of interfaces that move well.",
    domains: ["60fps.design", "www.60fps.design"],
  },
  {
    id: "awwwards",
    name: "Awwwards",
    homeUrl: "https://www.awwwards.com",
    browseUrl: "https://www.awwwards.com/websites/nominees/",
    category: "web",
    description: "Awards celebrating exceptional digital web craft.",
    domains: ["awwwards.com", "www.awwwards.com"],
  },
  {
    id: "cosmos",
    name: "Cosmos",
    homeUrl: "https://www.cosmos.so",
    browseUrl: "https://www.cosmos.so/explore",
    category: "moodboard",
    description: "Visual moodboarding and creative inspiration engine.",
    domains: ["cosmos.so", "www.cosmos.so"],
  },
  {
    id: "curated-design",
    name: "Curated Design",
    homeUrl: "https://www.curated.design",
    browseUrl: "https://curated.design/inspiration/web-apps/",
    category: "web",
    description: "Web design sorted by aesthetic style.",
    domains: ["curated.design", "www.curated.design"],
  },
  {
    id: "layers",
    name: "Layers",
    homeUrl: "https://layers.to",
    category: "other",
    description: "Platform for sharing design work publicly.",
    domains: ["layers.to", "www.layers.to"],
  },
  {
    id: "minimal-gallery",
    name: "Minimal Gallery",
    homeUrl: "https://minimal.gallery",
    browseUrl: "https://minimal.gallery/",
    category: "web",
    description: "Showcase of minimal and restrained websites.",
    domains: ["minimal.gallery", "www.minimal.gallery"],
  },
  {
    id: "mobbin",
    name: "Mobbin",
    homeUrl: "https://mobbin.com",
    browseUrl: "https://mobbin.com/explore/mobile",
    category: "mobile",
    description: "Real mobile and web product flows.",
    domains: ["mobbin.com", "www.mobbin.com"],
  },
  {
    id: "saaspo",
    name: "Saaspo",
    homeUrl: "https://saaspo.com",
    category: "web",
    description: "Curated SaaS landing page designs.",
    domains: ["saaspo.com", "www.saaspo.com"],
  },
  {
    id: "seesaw",
    name: "SEESAW",
    homeUrl: "https://www.seesaw.website",
    category: "component",
    description: "Design inspiration organized by page section.",
    domains: ["seesaw.website", "www.seesaw.website"],
  },
  {
    id: "supahero",
    name: "Supahero",
    homeUrl: "https://www.supahero.io",
    category: "component",
    description: "Curated collection of website hero sections.",
    domains: ["supahero.io", "www.supahero.io"],
  },
  {
    id: "imageory",
    name: "Imageory",
    homeUrl: "https://imageory.com",
    category: "moodboard",
    description: "Visual gallery pairing images with prompts.",
    domains: ["imageory.com", "www.imageory.com"],
  },
  {
    id: "backgrounds-supply",
    name: "Backgrounds Supply",
    homeUrl: "https://backgrounds.supply",
    category: "other",
    description: "Handcrafted website backgrounds ready to use.",
    domains: ["backgrounds.supply", "www.backgrounds.supply"],
  },
  {
    id: "venust-backgrounds",
    name: "Venust Backgrounds",
    homeUrl: "https://www.venust.bg",
    category: "other",
    description: "Free AI-generated backgrounds with original prompts.",
    domains: ["venust.bg", "www.venust.bg"],
  },
  {
    id: "details",
    name: "Details",
    homeUrl: "https://details.fm",
    category: "component",
    description: "Micro-interaction analysis of top digital products.",
    domains: ["details.fm", "www.details.fm", "details.tools"],
  },
  {
    id: "sombra",
    name: "Sombra",
    homeUrl: "https://sombra.design",
    category: "web",
    description: "Showcase of dark-mode website interfaces.",
    domains: ["sombra.design", "www.sombra.design"],
  },
  {
    id: "dribbble",
    name: "Dribbble",
    homeUrl: "https://dribbble.com",
    category: "moodboard",
    description: "Global community sharing design concepts.",
    domains: ["dribbble.com", "www.dribbble.com"],
  },
  {
    id: "behance",
    name: "Behance",
    homeUrl: "https://www.behance.net",
    category: "moodboard",
    description: "Adobe showcase for creative portfolios.",
    domains: ["behance.net", "www.behance.net"],
  },
  {
    id: "recent-design",
    name: "Recent Design",
    homeUrl: "https://recent.design",
    category: "web",
    description: "Weekly selection of award-worthy websites.",
    domains: ["recent.design", "www.recent.design"],
  },
  {
    id: "navbar-design",
    name: "navbar.design",
    homeUrl: "https://www.navbar.design",
    category: "component",
    description: "Curated gallery of navigation bar patterns.",
    domains: ["navbar.design", "www.navbar.design"],
  },
  {
    id: "footer-design",
    name: "footer.design",
    homeUrl: "https://www.footer.design",
    category: "component",
    description: "Curated gallery of creative website footers.",
    domains: ["footer.design", "www.footer.design"],
  },
  {
    id: "land-book",
    name: "Land-book",
    homeUrl: "https://land-book.com",
    category: "web",
    description: "Landing pages organized by industry.",
    domains: ["land-book.com", "www.land-book.com"],
  },
  {
    id: "collect-ui",
    name: "Collect UI",
    homeUrl: "https://collectui.com",
    category: "component",
    description: "Daily UI inspiration tagged by component.",
    domains: ["collectui.com", "www.collectui.com"],
  },
  {
    id: "siteinspire",
    name: "SiteInspire",
    homeUrl: "https://www.siteinspire.com",
    category: "web",
    description: "Showcase of fine web design craft.",
    domains: ["siteinspire.com", "www.siteinspire.com"],
  },
  {
    id: "lapa-ninja",
    name: "Lapa Ninja",
    homeUrl: "https://www.lapa.ninja",
    category: "web",
    description: "Curated gallery of responsive landing pages.",
    domains: ["lapa.ninja", "www.lapa.ninja"],
  },
  {
    id: "ux-archive",
    name: "UX Archive",
    homeUrl: "https://uxarchive.com",
    category: "mobile",
    description: "Historical archive of mobile onboarding flows.",
    domains: ["uxarchive.com", "www.uxarchive.com"],
  },
  {
    id: "screenlane",
    name: "Screenlane",
    homeUrl: "https://screenlane.com",
    category: "mobile",
    description: "Searchable gallery of interface screens.",
    domains: ["screenlane.com", "www.screenlane.com"],
  },
  {
    id: "flowbase",
    name: "Flowbase",
    homeUrl: "https://www.flowbase.co",
    category: "component",
    description: "Premium UI components and interaction patterns.",
    domains: ["flowbase.co", "www.flowbase.co"],
  },
  {
    id: "hover-states",
    name: "Hover States",
    homeUrl: "https://www.hoverstat.es",
    category: "web",
    description: "Showcase of innovative interactive web design.",
    domains: ["hoverstat.es", "www.hoverstat.es"],
  },
  {
    id: "saasframe",
    name: "SaaSFrame",
    homeUrl: "https://www.saasframe.io",
    category: "web",
    description: "Hundreds of SaaS marketing page screenshots.",
    domains: ["saasframe.io", "www.saasframe.io"],
  },
  {
    id: "landingfolio",
    name: "Landingfolio",
    homeUrl: "https://www.landingfolio.com",
    category: "web",
    description: "Extensive library of landing page designs.",
    domains: ["landingfolio.com", "www.landingfolio.com"],
  },
  {
    id: "pttrns",
    name: "Pttrns",
    homeUrl: "https://www.pttrns.com",
    category: "mobile",
    description: "Directory of mobile user interface patterns.",
    domains: ["pttrns.com", "www.pttrns.com"],
  },
  {
    id: "one-page-love",
    name: "One Page Love",
    homeUrl: "https://onepagelove.com",
    category: "web",
    description: "Showcase of single-page website designs.",
    domains: ["onepagelove.com", "www.onepagelove.com"],
  },
  {
    id: "designspiration",
    name: "Designspiration",
    homeUrl: "https://www.designspiration.com",
    category: "moodboard",
    description: "Creative search platform for visual art.",
    domains: ["designspiration.com", "www.designspiration.com"],
  },
  {
    id: "best-website-gallery",
    name: "Best Website Gallery",
    homeUrl: "https://bestwebsite.gallery",
    category: "web",
    description: "Curated archive of exceptional websites.",
    domains: ["bestwebsite.gallery", "www.bestwebsite.gallery"],
  },
  {
    id: "inspiration-grid",
    name: "Inspiration Grid",
    homeUrl: "https://theinspirationgrid.com",
    category: "moodboard",
    description: "Online magazine celebrating creative visual design.",
    domains: ["theinspirationgrid.com", "www.theinspirationgrid.com"],
  },
  {
    id: "scrnshts",
    name: "Scrnshts",
    homeUrl: "https://scrnshts.club",
    category: "mobile",
    description: "Curated App Store screenshot designs.",
    domains: ["scrnshts.club", "www.scrnshts.club"],
  },
  {
    id: "are-na",
    name: "Are.na",
    homeUrl: "https://www.are.na",
    category: "moodboard",
    description: "Collaborative research and visual bookmarking platform.",
    domains: ["are.na", "www.are.na"],
  },
  {
    id: "appinspo",
    name: "Appinspo",
    homeUrl: "https://appinspo.com",
    category: "mobile",
    description: "Curated mobile application design gallery.",
    domains: ["appinspo.com", "www.appinspo.com"],
  },
  {
    id: "dark-mode-design",
    name: "Dark Mode Design",
    homeUrl: "https://www.darkmodedesign.com",
    category: "web",
    description: "Showcase celebrating dark-mode websites.",
    domains: ["darkmodedesign.com", "www.darkmodedesign.com"],
  },
  {
    id: "pinterest",
    name: "Pinterest",
    homeUrl: "https://www.pinterest.com",
    category: "moodboard",
    description: "Visual discovery engine for creative ideas.",
    domains: ["pinterest.com", "www.pinterest.com"],
  },
  {
    id: "navbar-gallery",
    name: "navbar.gallery",
    homeUrl: "https://www.navbar.gallery",
    category: "component",
    description: "Focused collection of modern navigation bars.",
    domains: ["navbar.gallery", "www.navbar.gallery"],
  },
  {
    id: "posts-design",
    name: "posts.design",
    homeUrl: "https://www.posts.design",
    category: "other",
    description: "Curated social media graphic design archive.",
    domains: ["posts.design", "www.posts.design"],
  },
  {
    id: "loadmo-re",
    name: "loadmo.re",
    homeUrl: "https://loadmo.re",
    category: "mobile",
    description: "Gallery of experimental mobile website designs.",
    domains: ["loadmo.re", "www.loadmo.re"],
  },
  {
    id: "inspora-design",
    name: "inspora.design",
    homeUrl: "https://inspora.design",
    category: "web",
    description: "Archive of contemporary visual web design.",
    domains: ["inspora.design", "www.inspora.design"],
  },
  {
    id: "cta-gallery",
    name: "cta.gallery",
    homeUrl: "https://www.cta.gallery",
    category: "component",
    description: "Curated call-to-action button and banner designs.",
    domains: ["cta.gallery", "www.cta.gallery"],
  },
  {
    id: "desengs",
    name: "desengs.com",
    homeUrl: "https://desengs.com",
    category: "other",
    description: "Directory of design engineering portfolios and lore.",
    domains: ["desengs.com", "www.desengs.com"],
  },
  {
    id: "isthereanytool",
    name: "isthereanytool",
    homeUrl: "https://www.isthereanytool.com",
    category: "tool",
    description: "Directory of lesser-known design, craft, and AI tools.",
    domains: ["isthereanytool.com", "www.isthereanytool.com"],
  },
];

export const REQUIRED_SOURCE_NAMES = [
  "60fps",
  "Awwwards",
  "Cosmos",
  "Curated Design",
  "Layers",
  "Minimal Gallery",
  "Mobbin",
  "Saaspo",
  "SEESAW",
  "Supahero",
  "Imageory",
  "Backgrounds Supply",
  "Venust Backgrounds",
  "Details",
  "Sombra",
  "Dribbble",
  "Behance",
  "Recent Design",
  "navbar.design",
  "footer.design",
  "Land-book",
  "Collect UI",
  "SiteInspire",
  "Lapa Ninja",
  "UX Archive",
  "Screenlane",
  "Flowbase",
  "Hover States",
  "SaaSFrame",
  "Landingfolio",
  "Pttrns",
  "One Page Love",
  "Designspiration",
  "Best Website Gallery",
  "Inspiration Grid",
  "Scrnshts",
  "Are.na",
  "Appinspo",
  "Dark Mode Design",
  "Pinterest",
  "navbar.gallery",
  "posts.design",
  "loadmo.re",
  "inspora.design",
  "cta.gallery",
  "desengs.com",
  "isthereanytool",
  "Godly",
] as const;

export const SOURCES: InspoSource[] = ENTRIES.map((e) => ({
  ...e,
  hasDedicatedFetcher: e.hasDedicatedFetcher ?? DEDICATED.has(e.id),
}));

const byId = new Map(SOURCES.map((s) => [s.id, s]));
const byDomain = new Map<string, InspoSource>();
for (const s of SOURCES) {
  for (const d of s.domains) {
    byDomain.set(d.toLowerCase(), s);
  }
}

export function listSources(): InspoSource[] {
  return SOURCES;
}

export function getSource(id: string): InspoSource | undefined {
  return byId.get(id);
}

export function resolveSourceFromUrl(url: string): InspoSource | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return (
      byDomain.get(host) ||
      byDomain.get(`www.${host}`) ||
      [...byDomain.entries()].find(([d]) => host.endsWith(d.replace(/^www\./, "")))?.[1]
    );
  } catch {
    return undefined;
  }
}

export function sourceSummary(s: InspoSource) {
  return {
    id: s.id,
    name: s.name,
    homeUrl: s.homeUrl,
    category: s.category as SourceCategory,
    description: s.description,
    hasDedicatedFetcher: s.hasDedicatedFetcher,
  };
}

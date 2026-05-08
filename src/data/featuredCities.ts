export type FeaturedCity = {
  slug: string;
  label: string;
  region: string;
  image: string;
};

export const FEATURED_CITIES: FeaturedCity[] = [
  { slug: "tokyo", label: "Tokyo", region: "Kanto", image: "/images/regions/kanto-hero.jpg" },
  { slug: "kyoto", label: "Kyoto", region: "Kansai", image: "/images/regions/kansai-hero.jpg" },
  { slug: "osaka", label: "Osaka", region: "Kansai", image: "/images/regions/kansai-hero.jpg" },
  { slug: "kanazawa", label: "Kanazawa", region: "Chubu", image: "/images/regions/chubu-hero.jpg" },
  { slug: "hiroshima", label: "Hiroshima", region: "Chugoku", image: "/images/regions/chugoku-hero.jpg" },
  { slug: "naoshima", label: "Naoshima", region: "Shikoku", image: "/images/regions/shikoku-hero.jpg" },
];

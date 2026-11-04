/** Self-hosted font stylesheets (from @fontsource), shared by the mockup renderer and QA tools. */
export const FONTSOURCE_CSS: string[] = [
  ...["500", "600", "700", "800", "900", "500-italic", "600-italic", "700-italic", "800-italic"].map(
    (w) => `@fontsource/bodoni-moda/${w}.css`,
  ),
  ...["400", "500", "600", "700"].map((w) => `@fontsource/ibm-plex-mono/${w}.css`),
  ...["400", "500", "600", "400-italic"].map((w) => `@fontsource/ibm-plex-sans/${w}.css`),
];

/**
 * SEOHead — componente reutilizable para gestión de metadatos SEO por página.
 *
 * Uso:
 *   <SEOHead
 *     title="Reservas"
 *     description="Gestiona reservas y disponibilidad de espacios."
 *   />
 */
import { Helmet } from "react-helmet-async";
import { brand } from "../../config/brand";

export function SEOHead({
  title,
  description,
  image,
  noIndex = false,
}) {
  const siteOrigin = window.location.origin;
  const fullTitle = title ? `${title} | ${brand.name}` : `${brand.name} — Espacios en su momento`;
  const resolvedDescription = description || brand.description;
  const resolvedImage = image || `${siteOrigin}/img/nora-banner.png`;
  const canonical = `${siteOrigin}/`;

  return (
    <Helmet>
      {/* Primary */}
      <title>{fullTitle}</title>
      <meta name="description" content={resolvedDescription} />
      <meta name="robots" content={noIndex ? "noindex, nofollow" : "index, follow, max-snippet:160, max-image-preview:large"} />
      <meta name="theme-color" content="#245dc1" />
      <link rel="canonical" href={canonical} />
      <link rel="icon" type="image/svg+xml" href={brand.logo} />
      <link rel="apple-touch-icon" href="/img/nora-mark.png" />
      <link rel="manifest" href="/manifest.json" />
      <meta property="og:site_name" content={brand.name} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image:alt" content={brand.name} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={resolvedDescription} />
      <meta property="og:image" content={resolvedImage} />

      {/* Twitter */}
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      <meta name="twitter:image" content={resolvedImage} />
      <meta name="twitter:image:alt" content={brand.name} />
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org", "@type": "WebApplication", name: brand.name,
        url: canonical, description: resolvedDescription, applicationCategory: "BusinessApplication",
        operatingSystem: "All", inLanguage: "es-CO",
      })}</script>
    </Helmet>
  );
}

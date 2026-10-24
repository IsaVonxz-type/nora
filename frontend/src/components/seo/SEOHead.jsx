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
import { useOrganization } from "../../organizations/OrganizationContext";

export function SEOHead({
  title,
  description,
  image,
  noIndex = false,
}) {
  const organization = useOrganization();
  const isDemo = organization.slug === "demo";
  const siteOrigin = window.location.origin;
  const fullTitle = title ? `${title} | ${organization.name}` : `${organization.name} — Gestión de Ambientes y Reservas`;
  const resolvedDescription = !description || (isDemo && /Trama/i.test(description)) ? organization.description : description;
  const resolvedImage = image || `${siteOrigin}${organization.logo}`;
  const canonical = `${siteOrigin}${organization.base || "/"}`;

  return (
    <Helmet>
      {/* Primary */}
      <title>{fullTitle}</title>
      <meta name="description" content={resolvedDescription} />
      <meta name="robots" content={noIndex || isDemo ? "noindex, nofollow" : "index, follow, max-snippet:160, max-image-preview:large"} />
      <meta name="theme-color" content="#245dc1" />
      <link rel="canonical" href={canonical} />
      <link rel="icon" type="image/svg+xml" href={organization.logo} />
      <link rel="apple-touch-icon" href={organization.logo} />
      {!isDemo && <link rel="manifest" href="/manifest.json" />}
      {isDemo && <link rel="manifest" href="/manifest-demo.json" />}
      <meta property="og:site_name" content={organization.name} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image:alt" content={organization.name} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={resolvedDescription} />
      <meta property="og:image" content={resolvedImage} />

      {/* Twitter */}
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      <meta name="twitter:image" content={resolvedImage} />
      <meta name="twitter:image:alt" content={organization.name} />
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org", "@type": "WebApplication", name: organization.name,
        url: canonical, description: resolvedDescription, applicationCategory: "BusinessApplication",
        operatingSystem: "All", inLanguage: "es-CO",
      })}</script>
    </Helmet>
  );
}

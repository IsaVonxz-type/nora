import { SEOHead } from "../components/seo/SEOHead";
import styles from "../organizations/OrganizationTheme.module.css";

export function OrganizationUnavailablePage({ onRetry }) {
  return (
    <main id="main-content" className={styles.information}>
      <SEOHead title="No se pudo verificar la organización" noIndex />
      <h1>No pudimos verificar esta dirección.</h1>
      <p>
        No mostramos datos de otra institución mientras no podamos confirmar a qué organización pertenece este dominio.
      </p>
      <button type="button" className="btn-primary" onClick={onRetry}>
        Reintentar
      </button>
    </main>
  );
}

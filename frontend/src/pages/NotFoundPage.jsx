import { Link } from "react-router-dom";
import { SEOHead } from "../components/seo/SEOHead";
import { isDemoActive } from "../services/demoSession";
import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  const demo = isDemoActive();
  return (
    <main className={styles.page} id="main-content">
      <SEOHead title="Página no encontrada" noIndex />
      <section className={styles.panel}>
        <h1>Página no encontrada</h1>
        <p>La dirección que abriste no existe o cambió de lugar.</p>
        <Link className="btn-secondary" to={demo ? "/dashboard" : "/"}>
          {demo ? "Volver al panel de la demo" : "Ir al inicio de Nora"}
        </Link>
      </section>
    </main>
  );
}

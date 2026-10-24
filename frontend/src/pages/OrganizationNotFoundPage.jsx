import { SEOHead } from "../components/seo/SEOHead";
import styles from "../organizations/OrganizationTheme.module.css";

export function OrganizationNotFoundPage() {
  return (
    <main id="main-content" className={styles.information}>
      <SEOHead title="Organización no encontrada" noIndex />
      <h1>Esta dirección no está disponible.</h1>
      <p>
        No encontramos una organización asociada a este dominio. Puede que el enlace esté mal escrito o que la
        institución todavía no tenga acceso habilitado aquí.
      </p>
      <h2>Qué puedes hacer</h2>
      <p>
        Abre el enlace que te compartió tu institución o solicita a su administrador la dirección y las credenciales
        correctas. Escribir otro nombre de institución en la dirección no otorga acceso.
      </p>
    </main>
  );
}

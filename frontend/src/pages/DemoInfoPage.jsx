import { Link } from "react-router-dom";
import { SEOHead } from "../components/seo/SEOHead";
import { useOrganization } from "../organizations/OrganizationContext";
import styles from "../organizations/OrganizationTheme.module.css";

export function DemoInfoPage() {
  const organization = useOrganization();
  return <main id="main-content" className={styles.information}>
    <SEOHead title="Sobre esta demo" noIndex />
    <img src={organization.logo} width="48" height="48" alt="Espacio" />
    <h1>Un espacio para probar.</h1>
    <p>Espacio es una demostración de gestión de espacios compartidos. Permite consultar disponibilidad, organizar reservas y registrar entregas y devoluciones.</p>
    <h2>Datos de ejemplo</h2>
    <p>Usa únicamente datos ficticios. No introduzcas información personal real, contraseñas de otros servicios ni documentos confidenciales.</p>
    <h2>Una organización independiente</h2>
    <p>Las sedes, los espacios y las reservas pertenecen a la organización demo. La cuenta configurada en este entorno determina qué acciones puedes realizar.</p>
    <h2>Sin registro público</h2>
    <p>Esta versión no ofrece contratación, cobros ni recuperación pública de cuentas. Solicita las credenciales al administrador del entorno de demostración.</p>
    <Link to={organization.path("/")}>Volver a Espacio</Link>
  </main>;
}

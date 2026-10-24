import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { resetDemoData } from "../services/demoApi";
import { startDemoSession } from "../services/demoSession";
import styles from "./DemoEntry.module.css";

export function DemoEntry() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  useEffect(() => {
    if (!startDemoSession()) {
      setStorageUnavailable(true);
      return;
    }
    queryClient.clear();
    resetDemoData();
    navigate("/dashboard", { replace: true });
  }, [navigate, queryClient]);

  if (storageUnavailable) {
    return (
      <main className={styles.page} id="main-content">
        <section className={styles.panel} role="alert">
          <h1>No se pudo iniciar la demo</h1>
          <p>El navegador debe permitir almacenamiento temporal de sesión para aislar los datos de prueba.</p>
          <Link className="btn-secondary" to="/">Volver a Nora</Link>
        </section>
      </main>
    );
  }

  return <main className={styles.page} id="main-content" role="status">Preparando un espacio de prueba…</main>;
}

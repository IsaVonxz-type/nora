import { useEffect, useRef, useState } from "react";
import styles from "./QuickNavigation.module.css";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { normalizeSearch } from "../../utils/formatters";

export function QuickNavigation({ links }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const navigate = useNavigate();
  const matches = links.filter((link) => normalizeSearch(`${link.label} ${link.section}`).includes(normalizeSearch(search)));

  const show = () => {
    triggerRef.current = document.activeElement;
    setSearch("");
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const initialFocusRef = useFocusTrap(panelRef, { enabled: open, restoreFocus: false });

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" &&
          !document.querySelector('[aria-modal="true"]') &&
          !document.querySelector('.shell__sidebar.is-open')) {
        event.preventDefault();
        show();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return (
    <>
      <button className="quick-trigger" onClick={show} aria-haspopup="dialog">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
        <span>Ir a una vista</span><kbd>Ctrl K</kbd>
      </button>
      {open && createPortal(
        <div className={`modal-backdrop quick-backdrop ${styles.moduleScope}`} ref={panelRef}
          onClick={(event) => { if (event.target === event.currentTarget) close(); }}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
          <section className="modal quick-panel" role="dialog" aria-modal="true" aria-labelledby="quick-title">
            <header className="modal__header"><h2 id="quick-title">¿A dónde quieres ir?</h2><button className="btn-secondary" onClick={close}>Cerrar</button></header>
            <div className="modal__body stack-md">
              <label className="quick-search">Buscar una vista
                <input ref={initialFocusRef} type="search" placeholder="Calendario, disponibilidad…" value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") { event.preventDefault(); panelRef.current?.querySelector('.quick-result')?.focus(); }
                    if (event.key === "Enter" && matches.length === 1) { close(); navigate(matches[0].to); }
                  }} />
              </label>
              <nav aria-label="Resultados de navegación" className="quick-results">
                {matches.map((link) => <button key={link.to} className="quick-result" onClick={() => { close(); navigate(link.to); }}>
                  <span>{link.label}</span><span className="subtle">{link.section}</span>
                </button>)}
              </nav>
              {matches.length === 0 && <p role="status" className="subtle">No hay vistas que coincidan. Prueba otro nombre.</p>}
              <p className="quick-hint">Tab para recorrer · Enter para abrir · Esc para cerrar</p>
            </div>
          </section>
        </div>, document.body,
      )}
    </>
  );
}

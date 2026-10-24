import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useDarkMode } from "../../hooks/useDarkMode";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { FOCUSABLE_SELECTOR, useFocusTrap } from "../../hooks/useFocusTrap";
import { useToast } from "../ui/Toast";
import { QuickNavigation } from "./QuickNavigation";
import layoutStyles from "./MainLayout.module.css";
import controlsStyles from "../ui/Controls.module.css";
import cardsStyles from "../ui/Cards.module.css";
import reservationStyles from "../reservas/ReservationUI.module.css";
import { brand } from "../../config/brand";
import { endDemoSession, isDemoActive } from "../../services/demoSession";
import { resetDemoData } from "../../services/demoApi";

function NavIcon({ to }) {
  switch (to) {
    case "/dashboard":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 13h7V4H4zM13 20h7v-9h-7zM13 4h7v7h-7zM4 20h7v-5H4z" />
        </svg>
      );
    case "/calendario":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" ry="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      );
    case "/ambientes":
    case "/sedes":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          <path d="M9 21v-6h6v6" />
        </svg>
      );
    case "/reservas":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="2" ry="2" />
          <path d="M7 10h10M7 14h6" />
        </svg>
      );
    case "/operaciones":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 4h12v4H6zM4 10h16v10H4z" />
          <path d="M8 14h3M13 14h3M8 18h8" />
        </svg>
      );
    case "/disponibilidad":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "/analytics":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20V8" />
        </svg>
      );
    case "/usuarios":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <circle cx="17" cy="9" r="2" />
          <path d="M15 20a5 5 0 0 1 6 0" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function getLinksByRole(role) {
  const links = [
    { to: "/dashboard", label: "Dashboard", section: "Workspace" },
    { to: "/calendario", label: "Calendario", section: "Workspace" },
    { to: "/disponibilidad", label: "Disponibilidad", section: "Workspace" },
    { to: "/ambientes", label: "Ambientes", section: "Gestión" },
    { to: "/reservas", label: "Reservas", section: "Gestión" },
    { to: "/operaciones", label: "Operaciones", section: "Gestión" },
  ];

  if (role === "instructor") {
    return links.filter((item) => item.section === "Workspace");
  }

  if (role === "admin") {
    return [
      ...links,
      { to: "/analytics", label: "Analíticas", section: "Administración" },
      { to: "/usuarios", label: "Usuarios", section: "Administración" },
      { to: "/sedes", label: "Sedes", section: "Administración" },
    ];
  }

  return role === "logistica" ? links : [];
}

function getInitials(name) {
  if (!name) return "U";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function getPageTitle(pathname) {
  const titles = {
    "/dashboard": "Dashboard",
    "/calendario": "Calendario",
    "/disponibilidad": "Disponibilidad",
    "/ambientes": "Ambientes",
    "/reservas": "Reservas",
    "/operaciones": "Operaciones",
    "/analytics": "Analíticas",
    "/usuarios": "Usuarios",
    "/sedes": "Sedes",
  };
  return titles[pathname] || "Centro de operaciones";
}

function ThemeIcon({ isDark }) {
  return isDark ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" />
    </svg>
  );
}

export function MainLayout() {
  const { user, role, isLoading, logout } = useAuth();
  const { isDark, toggle } = useDarkMode();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const demoActive = isDemoActive();
  const links = getLinksByRole(role);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useLocalStorageState("sidebar-collapsed:v1", false);
  const menuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const sidebarTriggerRef = useRef(null);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    if (
      sidebarTriggerRef.current?.isConnected &&
      typeof sidebarTriggerRef.current.focus === "function"
    ) {
      sidebarTriggerRef.current.focus();
    }
  }, []);

  const handleLogout = () => {
    if (demoActive) {
      endDemoSession();
      resetDemoData();
      navigate("/", { replace: true });
      return;
    }
    void logout().catch(() => undefined);
  };

  const toggleSidebar = useCallback(() => {
    if (!isSidebarOpen) {
      sidebarTriggerRef.current = menuButtonRef.current || document.activeElement;
      setIsSidebarOpen(true);
      return;
    }
    closeSidebar();
  }, [closeSidebar, isSidebarOpen]);

  useFocusTrap(sidebarRef, { enabled: isSidebarOpen, restoreFocus: false });

  useEffect(() => {
    if (!isSidebarOpen) return undefined;

    const sidebar = sidebarRef.current;
    const firstFocusable = sidebar?.querySelector(".nav-link")
      || sidebar?.querySelector(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeSidebar();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeSidebar, isSidebarOpen]);

  useEffect(() => {
    const handler = (event) => {
      const message = event?.detail?.message;
      const type = event?.detail?.type || "error";
      if (message) toast(message, type);
    };

    window.addEventListener("app:http-error", handler);
    return () => window.removeEventListener("app:http-error", handler);
  }, [toast]);

  return (
      <div className={`shell${isCollapsed ? " shell--sidebar-collapsed" : ""} ${layoutStyles.moduleScope} ${controlsStyles.moduleScope} ${cardsStyles.moduleScope} ${reservationStyles.moduleScope}`}>
        <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      {/* ── Mobile topbar (hidden on desktop via CSS) ─────────── */}
      <header className="shell__topbar" aria-label="Cabecera de navegación">
        <button
          ref={menuButtonRef}
          className="shell__menu-btn"
          onClick={toggleSidebar}
          aria-label={isSidebarOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={isSidebarOpen}
          aria-controls="main-navigation"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {isSidebarOpen ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        <div className="shell__brand">
          <img className="shell__brand-logo" src={brand.logo} alt="" aria-hidden="true" />
          <div className="shell__brand-name">{brand.name}</div>
        </div>

        <div className="shell__topbar-actions">
          <button
            className="theme-toggle"
            onClick={toggle}
            title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-label={isDark ? "Modo claro" : "Modo oscuro"}
          >
            <ThemeIcon isDark={isDark} />
          </button>
          {!isLoading && user && (
            <div
              className="shell__avatar"
              aria-label={`Usuario: ${user.nombre}`}
            >
              {getInitials(user?.nombre)}
            </div>
          )}
        </div>
      </header>

      {/* ── Mobile overlay behind sidebar ─────────────────────── */}
      {isSidebarOpen && (
        <div
          className="shell__overlay"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside
        id="main-navigation"
        ref={sidebarRef}
        className={`shell__sidebar${isSidebarOpen ? " is-open" : ""}`}
        aria-label="Menú principal"
      >
        {/* Brand */}
        <div className="shell__brand shell__brand--sidebar">
          <img className="shell__brand-logo" src={brand.logo} alt="" aria-hidden="true" />
          <div className="shell__brand-text">
            <div className="shell__brand-name">{brand.name}</div>
            <div className="shell__brand-sub">{brand.subtitle}</div>
          </div>
          <button
            className="shell__collapse-btn"
            onClick={() => setIsCollapsed((v) => !v)}
            aria-label={isCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
            title={isCollapsed ? "Expandir" : "Colapsar"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {isCollapsed ? (
                <path d="M9 18l6-6-6-6" />
              ) : (
                <path d="M15 18l-6-6 6-6" />
              )}
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="shell__nav" aria-label="Navegación principal">
          {links.map((link, index) => (
            <div key={link.to} className="nav-group">
              {index === 0 || links[index - 1].section !== link.section ? (
                <span className="nav-group__label">{link.section}</span>
              ) : null}
              <NavLink
                to={link.to}
                title={link.label}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  ["nav-link", isActive ? "nav-link--active" : ""]
                    .filter(Boolean)
                    .join(" ")
                }
              >
                <span className="nav-link__icon" aria-hidden="true">
                  <NavIcon to={link.to} />
                </span>
                <span className="nav-link__label">{link.label}</span>
              </NavLink>
            </div>
          ))}
        </nav>

        {/* Sidebar footer — user + controls */}
        <div className="shell__sidebar-footer">
          <button
            className="theme-toggle"
            onClick={toggle}
            title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-label={isDark ? "Modo claro" : "Modo oscuro"}
          >
            <ThemeIcon isDark={isDark} />
          </button>

          {!isLoading && user && (
            <div className="shell__user" aria-live="polite">
              <div className="shell__avatar" aria-hidden="true">
                {getInitials(user?.nombre)}
              </div>
              <div className="shell__user-info">
                <div className="shell__user-name">
                  {user.nombre || "Usuario"}
                </div>
                <div className="shell__user-role">{user.rol || "sin rol"}</div>
              </div>
            </div>
          )}

          <button
            className="btn-ghost"
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 17l5-5-5-5M15 12H3" />
              <path d="M21 5v14" />
            </svg>
          </button>
        </div>

        <div className="shell__privacy-note">
          <span className="shell__privacy-link">Consulta las políticas de esta instalación</span>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <main
        className="shell__content"
        id="main-content"
        tabIndex="-1"
        inert={isSidebarOpen}
      >
        {demoActive && (
          <div className={layoutStyles.demoBanner} role="status">
            <div>
              <strong>Estás en la demo de Nora</strong>
              <span>Datos ficticios. Los cambios se reinician al salir o recargar.</span>
            </div>
            <button type="button" onClick={handleLogout}>Salir de la demo</button>
          </div>
        )}
        <header className="shell__workspace-bar">
          <div className="shell__breadcrumb">
            <span>Centro de operaciones</span>
            <span aria-hidden="true">/</span>
            <strong>{getPageTitle(location.pathname)}</strong>
          </div>
          <QuickNavigation links={links} />
        </header>
        <div className="page-enter">
          <Suspense fallback={<section className="panel loading-panel" role="status" aria-busy="true">Cargando vista…</section>}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { SEOHead } from "../components/seo/SEOHead";
import styles from "./LandingPage.module.css";

const tagline = "Cada ambiente disponible acerca una jornada de formación bien organizada.";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11M10 5l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 28" fill="none">
      <rect x="3.5" y="5.5" width="21" height="19" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 3.5v4M19.5 3.5v4M4 11h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 15h3M9 19h3M16 15h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SchedulePreview() {
  return (
    <div className="landing-preview" aria-label="Ejemplo ilustrativo de agenda de ambientes">
      <div className="landing-preview__topline">
        <span>Vista ilustrativa</span>
        <span className="landing-preview__live"><i /> Agenda</span>
      </div>
      <div className="landing-preview__heading">
        <div>
          <p className="landing-preview__eyebrow">Sede de formación</p>
          <h2>La jornada, en orden</h2>
        </div>
        <span className="landing-preview__icon"><CalendarIcon /></span>
      </div>
      <div className="landing-preview__date">
        <span>MIÉRCOLES</span>
        <strong>Agenda de ambientes</strong>
      </div>
      <div className="landing-preview__rows">
        <article className="landing-slot">
          <time>08:00</time>
          <div className="landing-slot__room"><strong>C 101</strong><span>Análisis de software</span></div>
          <span className="landing-slot__status">Reservado</span>
        </article>
        <article className="landing-slot landing-slot--active">
          <time>10:00</time>
          <div className="landing-slot__room"><strong>C 102</strong><span>Redes de datos</span></div>
          <span className="landing-slot__status">En curso</span>
        </article>
        <article className="landing-slot">
          <time>13:00</time>
          <div className="landing-slot__room"><strong>N 201</strong><span>Próxima reserva</span></div>
          <span className="landing-slot__status landing-slot__status--next">Próxima</span>
        </article>
      </div>
      <div className="landing-preview__foot">
        <span>Disponibilidad y operación en una sola vista</span>
        <span aria-hidden="true">↗</span>
      </div>
      <span className="landing-preview__index" aria-hidden="true">01 / 03</span>
    </div>
  );
}

function TaglineReveal() {
  const sectionRef = useRef(null);

  useEffect(() => {
    const words = sectionRef.current?.querySelectorAll("[data-tagline-word]");
    if (!words?.length) return undefined;

    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      words.forEach((word) => word.classList.add("is-visible"));
      return undefined;
    }

    let timers = [];
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      timers = Array.from(words, (word, index) => window.setTimeout(() => {
        word.classList.add("is-visible");
      }, index * 32));
    }, { threshold: 0.35 });

    observer.observe(sectionRef.current);
    return () => {
      observer.disconnect();
      timers.forEach(window.clearTimeout);
    };
  }, []);

  return (
    <section className="landing-tagline" ref={sectionRef} aria-label={tagline}>
      <p aria-hidden="true">
        {tagline.split(" ").map((word, index, words) => (
          <span className="landing-tagline__word" data-tagline-word key={`${word}-${index}`}>
            {word}{index < words.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
      <span className="landing-tagline__mark" aria-hidden="true">TRAMA / ESPACIOS</span>
    </section>
  );
}

const benefits = [
  {
    number: "01",
    title: "Encuentra el espacio adecuado",
    description: "Consulta ambientes por sede, fecha, horario y capacidad antes de organizar una actividad.",
    detail: "Disponibilidad por sede",
  },
  {
    number: "02",
    title: "Ordena cada reserva",
    description: "Mantén calendario, grupo, programa e instructor dentro del mismo flujo de trabajo.",
    detail: "Calendario compartido",
  },
  {
    number: "03",
    title: "Sigue la jornada completa",
    description: "Coordina entregas, devoluciones y bloqueos de mantenimiento con información clara.",
    detail: "Operación y mantenimiento",
  },
];

const steps = [
  { number: "01", title: "Busca", description: "Elige sede, fecha y condiciones del ambiente que necesitas." },
  { number: "02", title: "Confirma", description: "Revisa calendario y disponibilidad antes de coordinar la reserva." },
  { number: "03", title: "Acompaña", description: "Consulta cambios y da seguimiento a la entrega y devolución." },
];

const questions = [
  {
    question: "¿Qué puedo hacer desde la plataforma?",
    answer: "Consultar ambientes y disponibilidad, revisar el calendario y, según tu rol, gestionar reservas y operaciones.",
  },
  {
    question: "¿Necesito una cuenta para ingresar?",
    answer: "Sí. El acceso requiere credenciales asignadas por la administración del sistema. No hay registro público desde esta página.",
  },
  {
    question: "¿Puedo ver disponibilidad por sede y horario?",
    answer: "Sí. La consulta permite revisar los espacios disponibles según sede, fecha y horario.",
  },
  {
    question: "¿Quién puede gestionar reservas?",
    answer: "Las acciones disponibles dependen del rol de tu cuenta. Administración y logística cuentan con herramientas de gestión.",
  },
  {
    question: "¿La plataforma registra entregas y devoluciones?",
    answer: "Sí. El módulo de operaciones permite dar seguimiento a la entrega y devolución de ambientes reservados.",
  },
  {
    question: "¿Qué ocurre si un ambiente recibe otra reserva?",
    answer: "El sistema verifica cruces de horario al crear una reserva para evitar asignaciones simultáneas del mismo espacio.",
  },
];

export function LandingPage() {
  useEffect(() => {
    const revealItems = document.querySelectorAll("[data-landing-reveal]");
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15 });

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.page}>
      <SEOHead
        title="Gestión de ambientes de formación"
        description="Consulta disponibilidad, organiza reservas y coordina espacios compartidos desde una sola plataforma."
      />
      <header className="landing-header">
        <Link className="landing-brand" to="/" aria-label="Trama, inicio">
          <img src="/img/trama-mark.svg" alt="" width="44" height="44" />
          <span><strong>Trama</strong><small>Gestión de espacios</small></span>
        </Link>
        <nav className="landing-nav" aria-label="Navegación de la página">
          <a href="#funciones">Funciones</a>
          <a href="#proceso">Cómo funciona</a>
          <a href="#preguntas">Preguntas</a>
        </nav>
        <Link className="landing-cta landing-cta--header" to="/login">
          Iniciar sesión <ArrowIcon />
        </Link>
      </header>

      <main className="landing-main" id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero__copy">
            <p className="landing-kicker"><span /> Plataforma de ambientes de formación</p>
            <h1 id="landing-title">Más tiempo para formar. <span>Menos vueltas para encontrar espacio.</span></h1>
            <p className="landing-hero__description">
              Consulta disponibilidad por sede, organiza reservas y acompaña cada jornada desde un solo lugar.
            </p>
            <div className="landing-hero__actions">
              <Link className="landing-cta" to="/login">
                Iniciar sesión <ArrowIcon />
              </Link>
              <span>Acceso con credenciales institucionales</span>
            </div>
            <div className="landing-proof" aria-label="Funciones disponibles">
              <span>Disponibilidad</span><i />
              <span>Reservas</span><i />
              <span>Operación</span>
            </div>
          </div>
          <div className="landing-hero__visual" data-landing-reveal>
            <span className="landing-visual-caption">UNA VISTA DE LA JORNADA</span>
            <SchedulePreview />
            <span className="landing-visual-orbit" aria-hidden="true">TRAMA</span>
          </div>
          <a className="landing-scroll" href="#funciones"><span /> Explora la plataforma</a>
        </section>

        <TaglineReveal />

        <section className="landing-section landing-benefits" id="funciones" aria-labelledby="benefits-title">
          <div className="landing-section__intro" data-landing-reveal>
            <p className="landing-section__eyebrow">Una operación más clara</p>
            <h2 id="benefits-title">Del primer vistazo al cierre de jornada.</h2>
            <p>Las herramientas para coordinar espacios viven en un mismo sistema y responden a cada momento del día.</p>
          </div>
          <div className="landing-benefits__list">
            {benefits.map((benefit) => (
              <article className="landing-benefit" data-landing-reveal key={benefit.number}>
                <span className="landing-benefit__number">{benefit.number}</span>
                <div>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.description}</p>
                </div>
                <span className="landing-benefit__detail">{benefit.detail}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-process" id="proceso" aria-labelledby="process-title">
          <div className="landing-process__heading" data-landing-reveal>
            <p className="landing-section__eyebrow">Tres momentos, un mismo flujo</p>
            <h2 id="process-title">Organiza el espacio. Acompaña lo que pasa en él.</h2>
          </div>
          <div className="landing-steps">
            {steps.map((step) => (
              <article className="landing-step" data-landing-reveal key={step.number}>
                <span className="landing-step__number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-roles" aria-label="Acceso según el rol">
          <div className="landing-roles__symbol" aria-hidden="true">A /</div>
          <div>
            <p className="landing-section__eyebrow">Acceso según tu rol</p>
            <h2>La información que necesitas para coordinar mejor.</h2>
          </div>
          <p>Instructores consultan calendario y disponibilidad. Administración y logística cuentan con herramientas para gestionar ambientes y seguir la operación.</p>
        </section>

        <section className="landing-faq landing-section" id="preguntas" aria-labelledby="faq-title">
          <div className="landing-faq__heading" data-landing-reveal>
            <p className="landing-section__eyebrow">Antes de ingresar</p>
            <h2 id="faq-title">Respuestas para empezar.</h2>
          </div>
          <div className="landing-faq__list">
            {questions.map((item, index) => (
              <article className="landing-faq__item" data-landing-reveal key={item.question}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{item.question}</h3><p>{item.answer}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-final" aria-labelledby="final-title">
          <span className="landing-final__index">TRAMA / ESPACIOS</span>
          <div>
            <p className="landing-section__eyebrow">Tu jornada empieza aquí</p>
            <h2 id="final-title">Encuentra el espacio. Enfócate en enseñar.</h2>
          </div>
          <Link className="landing-cta landing-cta--light" to="/login">
            Iniciar sesión <ArrowIcon />
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <Link className="landing-brand landing-brand--footer" to="/" aria-label="Trama, inicio">
          <img src="/img/trama-mark.svg" alt="" width="36" height="36" />
          <span><strong>Trama</strong><small>Gestión de espacios</small></span>
        </Link>
        <p>Herramientas para coordinar espacios de formación.</p>
        <Link to="/login">Acceso de organizaciones</Link>
        <span>Reservas, disponibilidad y operación</span>
      </footer>
    </div>
  );
}

# Frontend styles

The frontend uses Vite CSS Modules without an additional styling dependency. Keep styles close to the page or component that owns them so route and component dependencies stay visible.

## Global stylesheet

`frontend/src/styles/global.css` is imported once from `frontend/src/main.jsx`. Keep it limited to:

- Self-hosted font declarations
- Design tokens and theme variables on `:root` and `[data-theme="dark"]`
- Reset, document defaults, element-level typography, and shared focus defaults

Do not add page or component selectors to this file. Do not add external font or stylesheet URLs; the production CSP allows styles and fonts from the app itself.

## Module locations

Page styles live beside their page, for example `frontend/src/pages/CalendarioPage.module.css`. Reusable component styles live beside their component. Import a module from the React file that owns the styles:

```jsx
import styles from "./Example.module.css";

export function Example() {
  return <section className={styles.root}>...</section>;
}
```

Prefer local class names and the exported `styles` object for new or substantially changed markup. This keeps selectors scoped and lets code review follow the dependency from component to stylesheet.

## Migrated legacy styles

Several existing views still depend on established class-name strings in JSX. Their styles have been moved into route or component CSS Modules and retain those names inside `:global(...)` selectors. This avoids a risky markup rewrite while making ownership and loading dependencies explicit. When touching one of these views, convert the relevant markup and selectors to local module classes; avoid expanding the `:global(...)` surface.

Current ownership:

| Owner | Stylesheet |
| --- | --- |
| Landing page | `pages/LandingPage.module.css` |
| Login, dashboard, calendar, analytics, availability, reservations, operations, and sites | Corresponding `pages/*Page.module.css` |
| Authenticated shell and quick navigation | `components/layout/*.module.css` |
| Controls, cards, skeletons, and toasts | `components/ui/*.module.css` |
| Reservation dialogs, cards, and details | `components/reservas/ReservationUI.module.css` |

Import shared module styles from the shared component or layout that requires them. Keep page-only styles imported by the page, not from `main.jsx`.

## Responsive, theme, and accessibility states

- Keep media queries in the module that owns the affected component.
- Keep keyframes beside their animation rules; avoid adding component animations to the global stylesheet.
- Use existing global design tokens in modules instead of duplicating colors or spacing values.
- Theme overrides may target the root `data-theme` attribute with `:global([data-theme="dark"] ...)` while a legacy class contract remains in use.
- Include hover, active, and visible keyboard-focus states for interactive elements; honor `prefers-reduced-motion` for animation.

## Verification

Run frontend checks from the frontend package:

```powershell
pnpm test
pnpm run build
```

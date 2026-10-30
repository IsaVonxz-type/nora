# Versionado y releases

Nora usa [Versionado Semántico 2.0](https://semver.org/lang/es/) (`MAJOR.MINOR.PATCH`) y [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/). Las versiones, el changelog, las etiquetas Git y los GitHub Releases los genera [release-please](https://github.com/googleapis/release-please); no se editan a mano.

## Qué sube cada número

| Cambio | Versión | Ejemplo |
|---|---|---|
| Corrección de un defecto sin cambiar el comportamiento esperado | **PATCH** (2.0.0 → 2.0.1) | `fix: rechazar reservas fuera del horario de la sede` |
| Funcionalidad nueva compatible | **MINOR** (2.0.0 → 2.1.0) | `feat: paginar el historial de auditoría` |
| Cambio incompatible | **MAJOR** (2.0.0 → 3.0.0) | `feat!: exigir TRUST_PROXY_HOPS en producción` |

Se considera incompatible, entre otros:

- Un cambio del contrato de la API que obliga a actualizar clientes.
- Una migración o un paso manual obligatorio al actualizar (variables de entorno nuevas requeridas, datos que hay que convertir).
- Retirar un rol, una ruta o una función existente.

## Formato de los commits

```
<tipo>(<ámbito opcional>): <descripción en imperativo>

<cuerpo opcional>

BREAKING CHANGE: <qué se rompe y cómo migrar>
```

| Tipo | Aparece en el changelog | Efecto en la versión |
|---|---|---|
| `feat` | Nuevas funciones | minor |
| `fix` | Correcciones | patch |
| `perf` | Rendimiento | patch |
| `revert` | Reversiones | patch |
| `docs` | Documentación | patch |
| `refactor`, `test`, `build`, `ci`, `chore` | No (ocultos) | ninguno |

Para un cambio incompatible agrega `!` tras el tipo (`feat!:`) o un pie `BREAKING CHANGE:`. Escribe la descripción pensando en quien lee el changelog, no en quien revisa el código.

## Flujo

1. Trabaja en una rama y abre un PR a `main`. Usa un título con formato de commit convencional; si haces *squash merge*, ese título será el commit.
2. Al hacer merge a `main`, el workflow `Release` (`.github/workflows/release.yml`) abre o actualiza un PR llamado `chore(main): release X.Y.Z`. Allí se ve la versión calculada y el changelog.
3. Cuando quieras publicar, haz merge de ese PR. Se crean automáticamente la etiqueta `vX.Y.Z` y el GitHub Release con sus notas, y se actualizan `CHANGELOG.md`, `package.json` y `frontend/package.json`.

Varios cambios pueden acumularse en un mismo PR de release; la versión final la decide el cambio de mayor impacto.

## Configuración requerida en GitHub

En **Settings → Actions → General → Workflow permissions** habilita *Read and write permissions* y *Allow GitHub Actions to create and approve pull requests*. Sin eso el workflow no puede abrir el PR de release.

Los PR creados con el token por defecto no disparan el workflow `CI`. Antes de hacer merge del PR de release, ejecuta los checks a mano o cierra y reabre el PR para que corran.

## Archivos

- `release-please-config.json`: tipos de commit y secciones del changelog.
- `.release-please-manifest.json`: última versión publicada. Lo actualiza el bot.
- `CHANGELOG.md`: historial legible por personas.

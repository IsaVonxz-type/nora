# Changelog

Las versiones siguen [Versionado Semántico](https://semver.org/lang/es/). Desde la versión 2.0.0 este archivo lo mantiene `release-please` a partir de los commits convencionales; consulta `docs/VERSIONING.md`.

## [2.1.0](https://github.com/IsaVonxz-type/nora/compare/v2.0.0...v2.1.0) (2026-10-31)


### Nuevas funciones

* **auth:** revoke every session of the account on logout ([4c8fe0a](https://github.com/IsaVonxz-type/nora/commit/4c8fe0a8c2174029ff635a18e1ada4ec09a15772))
* **demo:** load the demo adapter lazily and fix simulated reservations ([bed6eee](https://github.com/IsaVonxz-type/nora/commit/bed6eee85c70729f5a3459cd9ad0ab203d768537))
* **mantenimiento:** paginate maintenance blocks and confirm closing ([dd48e2b](https://github.com/IsaVonxz-type/nora/commit/dd48e2be01c9d9ee21c425c09de1e8299498b38f))
* **ops:** configurable proxy trust, required CORS_ORIGIN and strict baseline checks ([5b4e915](https://github.com/IsaVonxz-type/nora/commit/5b4e915c0698aeb751850be9f4c2ed43ccaf32df))
* **reservas:** enforce site hours and restrict rescheduling to pending reservations ([12573a6](https://github.com/IsaVonxz-type/nora/commit/12573a65950cc677c07edff80c516127cfff6acf))
* **seo:** canonical URLs and generated robots.txt and sitemap ([0ca511f](https://github.com/IsaVonxz-type/nora/commit/0ca511fabecfab5272ed16bf5315f7141439d846))
* **seo:** prerender the landing and answer unknown routes with a real 404 ([f0715a4](https://github.com/IsaVonxz-type/nora/commit/f0715a42a089000f940f6cd3b310065cf0e8574c))


### Correcciones

* **api:** validate room and user input and map integrity errors ([5525db1](https://github.com/IsaVonxz-type/nora/commit/5525db15c3578bd4a970215587dbabe344c58937))
* **deploy:** serve the app shell for known routes with a trailing slash ([ccea2be](https://github.com/IsaVonxz-type/nora/commit/ccea2be28baf38eed10e8627eae5031d5070ea48))
* **deploy:** use a valid path-to-regexp pattern for the app shell rewrite ([8119f61](https://github.com/IsaVonxz-type/nora/commit/8119f6169fe815e61d7476a090310a5fe14b1e6a))
* **deps:** override minimatch to the patched 11.x ([c5e6ba4](https://github.com/IsaVonxz-type/nora/commit/c5e6ba4cb2cfa0ad559a0b41bf01b46a88a42dc8))
* **deps:** update qs to the patched 6.17.1 ([6e436fe](https://github.com/IsaVonxz-type/nora/commit/6e436fe2ba3ddd7d8dfaf3120d409e35ca4bb3d7))
* **deps:** update undici and source-map-js in the frontend test toolchain ([de41a0c](https://github.com/IsaVonxz-type/nora/commit/de41a0c0174cc8bfc8e543e46d1e1d458de46767))
* **seo:** absolute social metadata and noindex outside the landing ([300a175](https://github.com/IsaVonxz-type/nora/commit/300a175519c5a1d40601fa9a7b855819e893b4b9))
* **ui:** accessibility, contrast and loading or error states ([2ce93a4](https://github.com/IsaVonxz-type/nora/commit/2ce93a4889331e273adf0db5cf88bbf40ce5506a))


### Rendimiento

* **analytics:** consistent snapshot and per-site utilization windows ([d7202b0](https://github.com/IsaVonxz-type/nora/commit/d7202b02ed6d6fa7815599f21ae60a0c952cbfef))


### Documentación

* document site hours, session revocation, proxy and origin settings ([0645aeb](https://github.com/IsaVonxz-type/nora/commit/0645aeb5b359395abc9d5f9d6c920f4234085f74))

## 2.0.0 (2026-10-30)

Línea base del versionado. Reúne el estado del proyecto antes de la primera entrega versionada.

### Nuevas funciones

* Demo pública aislada con datos sintéticos y adaptador en memoria que no contacta la API ni PostgreSQL.
* Conversión a una instalación única de Nora, con roles `Admin`, `Logistica` e `Instructor`.
* Sedes con horarios semanales, ambientes, disponibilidad, reservas con recurrencia y reprogramación, entregas y devoluciones, mantenimiento, usuarios y analíticas.

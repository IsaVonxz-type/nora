# Dominios de organización

Trama admite selección de organización mediante una ruta explícita o un host configurado. La precedencia es ruta `/organizaciones/:slug`, mapeo exacto de `ORGANIZATION_HOSTS` y, finalmente, organización predeterminada.

`ORGANIZATION_HOSTS` acepta pares separados por coma:

```text
ORGANIZATION_HOSTS=campus.example.edu=default,espacio.example.edu=demo
```

El slug selecciona presentación y membresía que se verifica durante login; no reemplaza autorización. Los hosts desconocidos deben fallar de forma cerrada cuando el enrutamiento por host está habilitado.

Los dominios mapeados se agregan como orígenes HTTPS exactos a CORS/CSRF. Mantén cookies de sesión host-only, sin atributo `Domain`, para no compartir tokens entre organizaciones.

La marca de cada organización está registrada en `frontend/src/organizations/organizations.js`. Para servir una nueva marca, agrega una entrada conocida al frontend y un mapeo de host que apunte a un slug real.

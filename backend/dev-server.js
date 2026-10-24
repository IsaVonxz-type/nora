import "dotenv/config";

// Valida variables críticas antes de levantar el servidor.
// Lanza si falta JWT_SECRET o DATABASE_URL.
import "./src/config/env.js";

import app from "./app.js";
import { PORT } from "./src/config/env.js";

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

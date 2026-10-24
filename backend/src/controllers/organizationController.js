import { HAS_ORGANIZATION_HOSTS } from "../config/env.js";
import { AppError } from "../utils/errors.js";

export function resolveOrganization(req, res) {
  if (req.organization) {
    res.json({ organization: { slug: req.organization.slug } });
    return;
  }

  if (!HAS_ORGANIZATION_HOSTS || req.isPlatformHostRequest || !req.requestHost) {
    res.json({ organization: null });
    return;
  }

  throw new AppError("Organizacion no encontrada", 404, "ORGANIZATION_NOT_FOUND");
}

import {
  getOrganizationSlugForHost,
  HAS_ORGANIZATION_HOSTS,
  isPlatformHost,
} from "../config/env.js";
import { getRequestHost } from "../tenancy/host.js";
import { AppError } from "../utils/errors.js";

export function resolveOrganizationHost(req, _res, next) {
  const host = getRequestHost(req);
  const slug = getOrganizationSlugForHost(host);

  req.requestHost = host;
  req.organization = slug ? { slug } : null;
  req.isPlatformHostRequest = isPlatformHost(host);

  if (HAS_ORGANIZATION_HOSTS && (!host || (!slug && !req.isPlatformHostRequest))) {
    return next(new AppError("Organizacion no encontrada", 404, "ORGANIZATION_NOT_FOUND"));
  }

  return next();
}

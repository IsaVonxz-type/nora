import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "../utils/errors.js";

const storage = new AsyncLocalStorage();

export function getTenantId() {
  return storage.getStore()?.tenantId;
}

export function requireTenantId() {
  const id = getTenantId();
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AppError("Institucion no autorizada", 403, "TENANT_REQUIRED");
  }
  return id;
}

export function runWithTenant(tenantId, callback) {
  if (!Number.isSafeInteger(tenantId) || tenantId < 1) {
    throw new AppError("Institucion no autorizada", 403, "TENANT_REQUIRED");
  }
  return storage.run({ tenantId }, callback);
}

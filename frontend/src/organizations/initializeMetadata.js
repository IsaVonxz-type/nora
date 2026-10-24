import { getOrganization } from "./organizations";

export function initializeMetadata(document, pathname, organization = getOrganization(pathname)) {
  document.head.querySelectorAll('[data-rh="true"]').forEach((element) => element.remove());
  document.title = organization?.name ?? "Organización no encontrada";
}

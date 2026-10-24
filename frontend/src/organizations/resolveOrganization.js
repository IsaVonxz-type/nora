import { httpClient } from "../services/httpClient";
import { getOrganizationBySlug } from "./organizations";

const NOT_FOUND = { status: "not-found", organization: null };
const ORGANIZATION_LOOKUP_TIMEOUT_MS = 2500;

export async function resolveHostOrganization({ signal } = {}) {
  try {
    const { data } = await httpClient.get("/api/organization", {
      signal,
      timeout: ORGANIZATION_LOOKUP_TIMEOUT_MS,
    });
    const slug = data?.organization?.slug;
    if (!slug) return { status: "platform", organization: null };

    const organization = getOrganizationBySlug(slug);
    return organization ? { status: "resolved", organization } : NOT_FOUND;
  } catch (error) {
    if (error?.response?.status === 404) return NOT_FOUND;
    return { status: "unavailable", organization: null };
  }
}

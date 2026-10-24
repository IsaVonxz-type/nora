function formatCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    const maxAgeSeconds = Math.floor(options.maxAge / 1000);
    parts.push(`Max-Age=${maxAgeSeconds}`);
    parts.push(
      `Expires=${new Date(Date.now() + options.maxAge).toUTCString()}`,
    );
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.sameSite) {
    const sameSite = String(options.sameSite).toLowerCase();
    parts.push(
      `SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`,
    );
  }
  return parts.join("; ");
}

export function setCookie(res, name, value, options = {}) {
  const headerValue = formatCookie(name, value, options);
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", headerValue);
    return;
  }
  const list = Array.isArray(existing) ? existing : [existing];
  res.setHeader("Set-Cookie", [...list, headerValue]);
}

import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestId(req, res, next) {
  const incoming = req.get("x-request-id");
  const id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

  req.requestId = id;
  req.startedAt = process.hrtime.bigint();
  res.setHeader("X-Request-Id", id);
  next();
}

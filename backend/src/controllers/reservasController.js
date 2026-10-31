import { asyncHandler } from "../utils/asyncHandler.js";
import * as reservasService from "../services/reservasService.js";
import { AppError } from "../utils/errors.js";
import { isValidISODate } from "../utils/date.js";
import { isPositivePostgresInteger, parsePagination } from "../utils/validation.js";

const DEFAULT_RESERVAS_LIMIT = 100;
const MAX_RESERVAS_LIMIT = 1000;
const MAX_RESERVAS_OFFSET = 100000;
const MAX_RESERVAS_RANGE_DAYS = 366;
const VALID_RESERVATION_STATES = new Set(["Reservado", "No disponible", "Cancelado"]);

function parsePaginationValue(value, name, fallback, max) {
  if (value === undefined) return fallback;
  const hasIntegerSyntax =
    (typeof value === "number" && Number.isInteger(value)) ||
    (typeof value === "string" && /^\d+$/.test(value));
  const parsed = Number(value);
  if (!hasIntegerSyntax || !Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    throw new AppError(`${name} debe ser un entero entre 0 y ${max}`, 400);
  }
  return parsed;
}

function parsePositiveInteger(value, name) {
  if (value === undefined) return undefined;
  const hasIntegerSyntax =
    (typeof value === "number" && Number.isInteger(value)) ||
    (typeof value === "string" && /^\d+$/.test(value));
  const parsed = Number(value);
  if (!hasIntegerSyntax || !isPositivePostgresInteger(parsed)) {
    throw new AppError(`${name} debe ser un entero positivo`, 400);
  }
  return parsed;
}

function parseSearch(value) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") {
    throw new AppError("search debe ser texto", 400);
  }
  const search = value.trim();
  if (search.length > 120) {
    throw new AppError("search no puede superar 120 caracteres", 400);
  }
  return search || undefined;
}

function parseReservationState(value) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !VALID_RESERVATION_STATES.has(value)) {
    throw new AppError("estado de reserva invalido", 400);
  }
  return value;
}

function validateReservationFilters(start, end) {
  if (!isValidISODate(start) || !isValidISODate(end)) {
    throw new AppError("Fechas invalidas", 400);
  }
  if (!start || !end) return;

  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  if (start > end) {
    throw new AppError("La fecha de inicio no puede ser posterior a la fecha fin", 400);
  }
  const rangeDays = Math.floor((endTime - startTime) / (24 * 60 * 60 * 1000)) + 1;
  if (rangeDays > MAX_RESERVAS_RANGE_DAYS) {
    throw new AppError(
      `El rango no puede superar ${MAX_RESERVAS_RANGE_DAYS} días`,
      400,
    );
  }
}

export const list = asyncHandler(async (req, res) => {
  const { start, end, ambienteId } = req.query;
  validateReservationFilters(start, end);
  const normalizedAmbienteId = parsePositiveInteger(ambienteId, "ambienteId");
  const estado = parseReservationState(req.query.estado);
  const search = parseSearch(req.query.search);
  const limit = parsePaginationValue(
    req.query.limit,
    "limit",
    DEFAULT_RESERVAS_LIMIT,
    MAX_RESERVAS_LIMIT,
  );
  const offset = parsePaginationValue(req.query.offset, "offset", 0, MAX_RESERVAS_OFFSET);
  const createdById =
    req.user?.rol === "Instructor" ? req.user.id : undefined;
  const result = await reservasService.getReservas({
    start,
    end,
    ambienteId: normalizedAmbienteId,
    estado,
    search,
    createdById,
    limit,
    offset,
  });
  const rows = Array.isArray(result) ? result : result.rows;
  const hasMore = Array.isArray(result) ? rows.length === limit : result.hasMore;
  res.setHeader("X-Has-More", String(hasMore));
  res.json(rows);
});

export const auditLog = asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id, "id");
  const result = await reservasService.getReservaAuditLog(id, parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 }));
  res.setHeader("X-Has-More", String(result.hasMore));
  res.json(result.rows);
});

export const create = asyncHandler(async (req, res) => {
  const createdBy = req.user?.nombre || "sistema";
  const createdById = req.user?.id || null;
  const userRole = req.user?.rol;
  const result = await reservasService.createReserva(req.body, createdBy, userRole, createdById);
  res.status(201).json(result);
});

export const cancel = asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id, "id");
  const row = await reservasService.cancelReserva(id, req.user?.nombre || "sistema", req.user?.id);
  res.json(row);
});

export const deliver = asyncHandler(async (req, res) => {
  const usuario = req.user?.nombre || "sistema";
  const id = parsePositiveInteger(req.params.id, "id");
  const row = await reservasService.deliverReserva(id, usuario, req.user?.id);
  res.json(row);
});

export const returnReserva = asyncHandler(async (req, res) => {
  const usuario = req.user?.nombre || "sistema";
  const id = parsePositiveInteger(req.params.id, "id");
  const row = await reservasService.returnReserva(id, usuario, req.user?.id);
  res.json(row);
});

export const reschedule = asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id, "id");
  res.json(await reservasService.rescheduleReserva(id, req.body, {
    id: req.user?.id,
    name: req.user?.nombre || "sistema",
  }));
});

export const rescheduleAvailability = asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id, "id");
  res.json(await reservasService.getRescheduleAvailability(id, req.query));
});

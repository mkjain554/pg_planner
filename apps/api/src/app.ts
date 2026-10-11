import { randomBytes, randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import helmet from "helmet";
import { Prisma, type MemberRole, type PropertyStatus } from "@prisma/client";
import swaggerUi from "swagger-ui-express";
import { z, ZodError } from "zod";
import { config } from "./config.js";
import { moneyAmountSchema } from "./money.js";
import { prisma as defaultPrisma } from "./prisma.js";

const PgSession = connectPgSimple(session);
const appLogger = (level: "info" | "warn" | "error", message: string, data: Record<string, unknown> = {}) =>
  console[level](JSON.stringify({ level, message, ...data }));

const authSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Passwords cannot exceed 72 UTF-8 bytes."),
});
const registerSchema = authSchema.extend({
  fullName: z.string().trim().min(2).max(160),
  organizationName: z.string().trim().min(2).max(160),
});
const propertySchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  type: z.enum(["PG", "HOSTEL", "CO_LIVING"]).default("PG"),
  addressLine1: z.string().trim().min(2).max(200),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  locality: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(3).max(16),
  country: z.string().trim().min(1).max(80).default("India"),
  description: z.string().trim().max(1000).nullable().optional(),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactPhone: z.string().trim().max(32).nullable().optional(),
  defaultBillingDay: z.number().int().min(1).max(28).default(1),
  currency: z.string().trim().length(3).default("INR"),
});
const roomSchema = z.object({
  identifier: z.string().trim().min(1).max(40),
  floor: z.string().trim().min(1).max(40).default("Ground"),
  type: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "DORMITORY", "OTHER"]).default("OTHER"),
  capacity: z.number().int().min(1).max(100),
  description: z.string().trim().max(600).nullable().optional(),
});
const bedSchema = z.object({
  label: z.string().trim().min(1).max(40),
  code: z.string().trim().max(40).nullable().optional(),
  monthlyRent: moneyAmountSchema,
  depositAmount: moneyAmountSchema.default("0.00"),
  notes: z.string().trim().max(600).nullable().optional(),
});
const tenantSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(5).max(32),
  email: z.string().trim().email().max(320).nullable().optional(),
});
const occupancySchema = z.object({
  tenantId: z.string().uuid(),
  bedId: z.string().uuid(),
  checkIn: z.coerce.date(),
  plannedCheckOut: z.coerce.date().nullable().optional(),
  agreedMonthlyRent: moneyAmountSchema,
  agreedDeposit: moneyAmountSchema,
}).refine((value) => !value.plannedCheckOut || value.plannedCheckOut > value.checkIn, {
  path: ["plannedCheckOut"],
  message: "Planned check-out must be after check-in.",
});

type AppPrisma = typeof defaultPrisma;
type Context = { organizationId: string; userId: string; role: MemberRole };
type ContextRequest = Request & { context?: Context };

function apiError(status: number, code: string, message: string, details: unknown = []) {
  return Object.assign(new Error(message), { status, code, details });
}

function asyncRoute(handler: (req: ContextRequest, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(handler(req as ContextRequest, res, next)).catch(next);
}

function slugify(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${randomBytes(3).toString("hex")}`;
}

function pagination(query: Request["query"]) {
  const parsed = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional(),
    status: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  }).parse(query);
  return { ...parsed, skip: (parsed.page - 1) * parsed.pageSize };
}

function withRoomBedCount<T extends { beds: { id: string; status: string; occupancies: { status: string }[] }[] }>(room: T) {
  return {
    ...room,
    bedCount: room.beds.length,
    beds: room.beds.map((bed) => ({
      ...bed,
      status: bed.occupancies.some((occupancy) => occupancy.status === "ACTIVE") ? "OCCUPIED" : bed.status,
    })),
  };
}

export function createApp(db: AppPrisma = defaultPrisma, options: { sessionStore?: session.Store } = {}) {
  const app = express();
  const csrfSafeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many authentication attempts. Try again later.", details: [] } },
  });
  const store = options.sessionStore || new PgSession({
    conString: config.DATABASE_URL,
    createTableIfMissing: true,
    tableName: "app_sessions",
  });

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const requestId = req.header("x-request-id")?.slice(0, 100) || randomUUID();
    res.setHeader("x-request-id", requestId);
    appLogger("info", "request", { requestId, method: req.method, path: req.path });
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true, methods: ["GET", "POST", "PATCH", "OPTIONS"] }));
  app.use(express.json({ limit: "1mb" }));
  app.use(session({
    name: "pgplanner.sid",
    secret: config.SESSION_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 },
  }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", asyncRoute(async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ready", database: "connected" });
  }));
  app.get("/api/docs/openapi.json", (_req, res) => res.json(openApiDocument));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  const managementRoles: MemberRole[] = ["OWNER", "PROPERTY_MANAGER", "PLATFORM_ADMIN"];
  const requireRoles = (...allowedRoles: MemberRole[]) => (req: Request, _res: Response, next: NextFunction) => {
    const role = (req as ContextRequest).context?.role;
    if (!role || !allowedRoles.includes(role)) return next(apiError(403, "FORBIDDEN", "Your organization role cannot perform this action."));
    return next();
  };
  const router = express.Router();
  router.use((req, res, next) => {
    if (csrfSafeMethods.has(req.method)) return next();
    if (!req.session.userId) return next();
    if (req.header("x-csrf-token") !== req.session.csrfToken) {
      return next(apiError(403, "CSRF_INVALID", "Your security token has expired. Refresh and try again."));
    }
    return next();
  });

  router.post("/auth/register", authLimiter, asyncRoute(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const existing = await db.user.findUnique({ where: { email: input.email } });
    if (existing) throw apiError(409, "EMAIL_EXISTS", "An account with this email already exists.");
    const passwordHash = await hash(input.password, 12);
    const created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: input.email, fullName: input.fullName, passwordHash } });
      const organization = await tx.organization.create({
        data: { name: input.organizationName, slug: slugify(input.organizationName) },
      });
      await tx.organizationMember.create({ data: { userId: user.id, organizationId: organization.id, role: "OWNER" } });
      await tx.auditLog.create({
        data: { userId: user.id, organizationId: organization.id, action: "AUTH_REGISTERED", entityType: "User", entityId: user.id },
      });
      return { user, organization };
    });
    req.session.userId = created.user.id;
    req.session.organizationId = created.organization.id;
    req.session.csrfToken = randomBytes(32).toString("hex");
    res.status(201).json({ data: { user: publicUser(created.user), organization: created.organization, csrfToken: req.session.csrfToken } });
  }));
  router.post("/auth/login", authLimiter, asyncRoute(async (req, res) => {
    const input = authSchema.parse(req.body);
    const user = await db.user.findUnique({
      where: { email: input.email },
      include: { memberships: { include: { organization: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!user || !(await compare(input.password, user.passwordHash))) {
      throw apiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    const membership = user.memberships.find((item) => item.organizationId === req.body.organizationId) || user.memberships[0];
    if (!membership) throw apiError(403, "NO_ORGANIZATION", "This account is not a member of an organization.");
    await new Promise<void>((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    req.session.organizationId = membership.organizationId;
    req.session.csrfToken = randomBytes(32).toString("hex");
    res.json({ data: { user: publicUser(user), organization: membership.organization, csrfToken: req.session.csrfToken } });
  }));
  router.post("/auth/logout", requireAuth, asyncRoute(async (req, res) => {
    await new Promise<void>((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    res.clearCookie("pgplanner.sid", { httpOnly: true, sameSite: "lax", secure: config.cookieSecure });
    res.json({ data: { loggedOut: true } });
  }));
  router.get("/auth/me", requireAuth, asyncRoute(async (req, res) => {
    const context = req.context!;
    const [user, membership] = await Promise.all([
      db.user.findUnique({ where: { id: context.userId } }),
      db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: context.organizationId, userId: context.userId } },
        include: { organization: true },
      }),
    ]);
    if (!user || !membership) throw apiError(401, "SESSION_INVALID", "Your session is no longer valid.");
    res.json({ data: { user: publicUser(user), organization: membership.organization, role: membership.role, csrfToken: req.session.csrfToken } });
  }));

  router.get("/dashboard/summary", requireAuth, asyncRoute(async (req, res) => {
    const organizationId = req.context!.organizationId;
    const [properties, rooms, beds, occupied, available, tenants, activeOccupancies] = await Promise.all([
      db.property.count({ where: { organizationId, status: "ACTIVE" } }),
      db.room.count({ where: { status: "ACTIVE", property: { organizationId, status: "ACTIVE" } } }),
      db.bed.count({ where: { room: { status: "ACTIVE", property: { organizationId, status: "ACTIVE" } } } }),
      db.occupancy.count({ where: { status: "ACTIVE", bed: { room: { status: "ACTIVE", property: { organizationId, status: "ACTIVE" } } } } }),
      db.bed.count({
        where: {
          status: "AVAILABLE",
          room: { status: "ACTIVE", property: { organizationId, status: "ACTIVE" } },
          occupancies: { none: { status: "ACTIVE" } },
        },
      }),
      db.tenant.count({ where: { organizationId, occupancies: { some: { status: "ACTIVE" } } } }),
      db.occupancy.aggregate({
        where: { status: "ACTIVE", bed: { room: { property: { organizationId, status: "ACTIVE" } } } },
        _sum: { agreedMonthlyRent: true },
      }),
    ]);
    res.json({ data: {
      totalProperties: properties, totalRooms: rooms, totalBeds: beds, occupiedBeds: occupied,
      vacantBeds: available, occupancyPercentage: beds ? Math.round((occupied / beds) * 1000) / 10 : 0,
      activeTenants: tenants, expectedMonthlyRent: activeOccupancies._sum.agreedMonthlyRent?.toFixed(2) || "0.00",
    } });
  }));
  router.get("/dashboard/occupancy", requireAuth, asyncRoute(async (req, res) => {
    const properties = await db.property.findMany({
      where: { organizationId: req.context!.organizationId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      include: {
        rooms: {
          where: { status: "ACTIVE" },
          include: {
            beds: {
              include: { occupancies: { where: { status: "ACTIVE" }, select: { id: true } } },
            },
          },
        },
      },
    });
    const byProperty = properties.map((property) => {
      const allBeds = property.rooms.flatMap((room) => room.beds);
      const occupiedBeds = allBeds.filter((bed) => bed.occupancies.length > 0).length;
      const vacantBeds = allBeds.filter((bed) => bed.status === "AVAILABLE" && bed.occupancies.length === 0).length;
      return { id: property.id, name: property.name, totalBeds: allBeds.length, occupiedBeds, vacantBeds };
    });
    res.json({ data: { bedStatus: [
      { name: "Occupied", value: byProperty.reduce((sum, item) => sum + item.occupiedBeds, 0), color: "#818cf8" },
      { name: "Vacant", value: byProperty.reduce((sum, item) => sum + item.vacantBeds, 0), color: "#27324b" },
    ], byProperty } });
  }));
  router.get("/dashboard/recent-activity", requireAuth, asyncRoute(async (req, res) => {
    const rows = await db.occupancy.findMany({
      where: { bed: { room: { property: { organizationId: req.context!.organizationId } } } },
      orderBy: { updatedAt: "desc" }, take: 8,
      include: { tenant: true, bed: { include: { room: { include: { property: true } } } } },
    });
    res.json({ data: rows.map((row) => ({
      id: row.id, tenant: row.tenant.fullName, property: row.bed.room.property.name,
      room: row.bed.room.identifier, bed: row.bed.label, action: row.status === "ACTIVE" ? "Check-in" : "Check-out",
      date: row.status === "ACTIVE" ? row.checkIn : row.actualCheckOut || row.updatedAt,
    })) });
  }));

  router.get("/properties", requireAuth, asyncRoute(async (req, res) => {
    const page = pagination(req.query);
    const status = req.query.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
    const sortable = ["name", "code", "city", "createdAt"] as const;
    const sortBy = sortable.includes(page.sortBy as typeof sortable[number]) ? page.sortBy as typeof sortable[number] : "createdAt";
    const where: Prisma.PropertyWhereInput = {
      organizationId: req.context!.organizationId, status,
      ...(page.search ? { OR: [
        { name: { contains: page.search, mode: "insensitive" } },
        { code: { contains: page.search, mode: "insensitive" } },
        { city: { contains: page.search, mode: "insensitive" } },
        { locality: { contains: page.search, mode: "insensitive" } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      db.property.findMany({
        where, skip: page.skip, take: page.pageSize, orderBy: { [sortBy]: page.sortOrder },
        include: { rooms: { select: { id: true, beds: { select: { id: true, occupancies: { where: { status: "ACTIVE" }, select: { id: true } } } } } } },
      }),
      db.property.count({ where }),
    ]);
    res.json({ data: items.map((property) => {
      const beds = property.rooms.flatMap((room) => room.beds);
      const rooms = property.rooms.length;
      return { ...property, roomCount: rooms, bedCount: beds.length, occupiedBeds: beds.filter((bed) => bed.occupancies.length > 0).length, rooms: undefined };
    }), meta: { page: page.page, pageSize: page.pageSize, total, pageCount: Math.ceil(total / page.pageSize) } });
  }));
  router.post("/properties", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const input = propertySchema.parse(req.body);
    const property = await db.$transaction(async (tx) => {
      const created = await tx.property.create({ data: { ...input, organizationId: req.context!.organizationId } });
      await tx.auditLog.create({ data: {
        organizationId: req.context!.organizationId, userId: req.context!.userId,
        action: "PROPERTY_CREATED", entityType: "Property", entityId: created.id,
      } });
      return created;
    });
    res.status(201).json({ data: property });
  }));
  router.get("/properties/:id", requireAuth, asyncRoute(async (req, res) => {
    const property = await db.property.findFirst({
      where: { id: uuidParam(req.params.id), organizationId: req.context!.organizationId },
      include: { rooms: { orderBy: [{ floor: "asc" }, { identifier: "asc" }], include: { beds: { orderBy: { label: "asc" }, include: { occupancies: { where: { status: "ACTIVE" }, include: { tenant: true } } } } } } },
    });
    if (!property) throw apiError(404, "NOT_FOUND", "Property not found.");
    res.json({ data: {
      ...property,
      rooms: property.rooms.map((room) => withRoomBedCount(room)),
    } });
  }));
  router.patch("/properties/:id", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const input = propertySchema.partial().parse(req.body);
    const current = await db.property.findFirst({ where: { id: uuidParam(req.params.id), organizationId: req.context!.organizationId } });
    if (!current) throw apiError(404, "NOT_FOUND", "Property not found.");
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.property.update({ where: { id: current.id }, data: input });
      await tx.auditLog.create({ data: {
        organizationId: req.context!.organizationId, userId: req.context!.userId,
        action: "PROPERTY_UPDATED", entityType: "Property", entityId: row.id,
      } });
      return row;
    });
    res.json({ data: updated });
  }));
  router.post("/properties/:id/archive", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const property = await db.property.findFirst({ where: { id: uuidParam(req.params.id), organizationId: req.context!.organizationId } });
    if (!property) throw apiError(404, "NOT_FOUND", "Property not found.");
    const activeOccupancies = await db.occupancy.count({
      where: { status: "ACTIVE", bed: { room: { propertyId: property.id } } },
    });
    if (activeOccupancies) throw apiError(409, "PROPERTY_OCCUPIED", "Check out active tenants before archiving this property.");
    await db.$transaction(async (tx) => {
      await tx.property.update({ where: { id: property.id }, data: { status: "ARCHIVED" } });
      await tx.auditLog.create({ data: {
        organizationId: req.context!.organizationId, userId: req.context!.userId,
        action: "PROPERTY_ARCHIVED", entityType: "Property", entityId: property.id,
      } });
    });
    res.json({ data: { id: property.id, status: "ARCHIVED" satisfies PropertyStatus } });
  }));

  router.get("/properties/:propertyId/rooms", requireAuth, asyncRoute(async (req, res) => {
    const property = await db.property.findFirst({ where: { id: uuidParam(req.params.propertyId), organizationId: req.context!.organizationId } });
    if (!property) throw apiError(404, "NOT_FOUND", "Property not found.");
    const rooms = await db.room.findMany({
      where: { propertyId: property.id }, orderBy: [{ floor: "asc" }, { identifier: "asc" }],
      include: { beds: { orderBy: { label: "asc" }, include: { occupancies: { where: { status: "ACTIVE" }, select: { id: true, status: true } } } } },
    });
    res.json({ data: rooms.map((room) => withRoomBedCount(room)) });
  }));
  router.post("/properties/:propertyId/rooms", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const input = roomSchema.parse(req.body);
    const property = await db.property.findFirst({ where: { id: uuidParam(req.params.propertyId), organizationId: req.context!.organizationId, status: "ACTIVE" } });
    if (!property) throw apiError(404, "NOT_FOUND", "Active property not found.");
    const room = await db.$transaction(async (tx) => {
      const created = await tx.room.create({ data: { ...input, propertyId: property.id, organizationId: req.context!.organizationId } });
      await tx.auditLog.create({ data: {
        organizationId: req.context!.organizationId, userId: req.context!.userId,
        action: "ROOM_CREATED", entityType: "Room", entityId: created.id,
      } });
      return created;
    });
    res.status(201).json({ data: { ...room, bedCount: 0, beds: [] } });
  }));
  router.get("/rooms/:id", requireAuth, asyncRoute(async (req, res) => {
    const room = await db.room.findFirst({
      where: { id: uuidParam(req.params.id), property: { organizationId: req.context!.organizationId } },
      include: { property: true, beds: { include: { occupancies: { where: { status: "ACTIVE" }, include: { tenant: true } } } } },
    });
    if (!room) throw apiError(404, "NOT_FOUND", "Room not found.");
    res.json({ data: withRoomBedCount(room) });
  }));
  router.patch("/rooms/:id", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const input = roomSchema.partial().extend({ status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional() }).parse(req.body);
    const current = await db.room.findFirst({ where: { id: uuidParam(req.params.id), property: { organizationId: req.context!.organizationId } } });
    if (!current) throw apiError(404, "NOT_FOUND", "Room not found.");
    if (input.capacity !== undefined) {
      const bedCount = await db.bed.count({ where: { roomId: current.id } });
      if (input.capacity < bedCount) throw apiError(409, "CAPACITY_BELOW_BED_COUNT", "Room capacity cannot be lower than its existing bed count.");
    }
    const updated = await db.room.update({ where: { id: current.id }, data: input });
    await db.auditLog.create({ data: {
      organizationId: req.context!.organizationId, userId: req.context!.userId,
      action: "ROOM_UPDATED", entityType: "Room", entityId: updated.id,
    } });
    res.json({ data: updated });
  }));
  router.post("/rooms/:id/archive", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const room = await db.room.findFirst({ where: { id: uuidParam(req.params.id), property: { organizationId: req.context!.organizationId } } });
    if (!room) throw apiError(404, "NOT_FOUND", "Room not found.");
    if (await db.occupancy.count({ where: { status: "ACTIVE", bed: { roomId: room.id } } })) {
      throw apiError(409, "ROOM_OCCUPIED", "Check out current tenants before deactivating this room.");
    }
    const updated = await db.room.update({ where: { id: room.id }, data: { status: "INACTIVE" } });
    await db.auditLog.create({ data: {
      organizationId: req.context!.organizationId, userId: req.context!.userId,
      action: "ROOM_ARCHIVED", entityType: "Room", entityId: room.id,
    } });
    res.json({ data: updated });
  }));

  router.get("/rooms/:roomId/beds", requireAuth, asyncRoute(async (req, res) => {
    const room = await db.room.findFirst({ where: { id: uuidParam(req.params.roomId), property: { organizationId: req.context!.organizationId } } });
    if (!room) throw apiError(404, "NOT_FOUND", "Room not found.");
    const beds = await db.bed.findMany({
      where: { roomId: room.id }, orderBy: { label: "asc" },
      include: { occupancies: { where: { status: "ACTIVE" }, include: { tenant: true } } },
    });
    res.json({ data: beds.map((bed) => ({ ...bed, status: bed.occupancies.length ? "OCCUPIED" : bed.status })) });
  }));
  router.post("/rooms/:roomId/beds", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const input = bedSchema.parse(req.body);
    const room = await db.room.findFirst({
      where: { id: uuidParam(req.params.roomId), status: "ACTIVE", property: { organizationId: req.context!.organizationId, status: "ACTIVE" } },
    });
    if (!room) throw apiError(409, "ROOM_INACTIVE", "Beds can only be added to an active room in an active property.");
    if (await db.bed.count({ where: { roomId: room.id } }) >= room.capacity) throw apiError(409, "ROOM_CAPACITY_REACHED", "This room has reached its bed capacity.");
    const bed = await db.$transaction(async (tx) => {
      const created = await tx.bed.create({ data: { ...input, roomId: room.id, organizationId: req.context!.organizationId } });
      await tx.auditLog.create({ data: {
        organizationId: req.context!.organizationId, userId: req.context!.userId,
        action: "BED_CREATED", entityType: "Bed", entityId: created.id,
      } });
      return created;
    });
    res.status(201).json({ data: bed });
  }));
  router.get("/beds/:id", requireAuth, asyncRoute(async (req, res) => {
    const bed = await db.bed.findFirst({
      where: { id: uuidParam(req.params.id), room: { property: { organizationId: req.context!.organizationId } } },
      include: { room: { include: { property: true } }, occupancies: { orderBy: { checkIn: "desc" }, include: { tenant: true } } },
    });
    if (!bed) throw apiError(404, "NOT_FOUND", "Bed not found.");
    res.json({ data: { ...bed, status: bed.occupancies.some((item) => item.status === "ACTIVE") ? "OCCUPIED" : bed.status } });
  }));
  router.patch("/beds/:id", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const input = bedSchema.partial().extend({ status: z.enum(["AVAILABLE", "MAINTENANCE", "INACTIVE"]).optional() }).parse(req.body);
    const current = await db.bed.findFirst({ where: { id: uuidParam(req.params.id), room: { property: { organizationId: req.context!.organizationId } } } });
    if (!current) throw apiError(404, "NOT_FOUND", "Bed not found.");
    if (input.status && await db.occupancy.count({ where: { bedId: current.id, status: "ACTIVE" } })) {
      throw apiError(409, "BED_OCCUPIED", "An occupied bed cannot be made unavailable.");
    }
    const updated = await db.bed.update({ where: { id: current.id }, data: input });
    await db.auditLog.create({ data: {
      organizationId: req.context!.organizationId, userId: req.context!.userId,
      action: "BED_UPDATED", entityType: "Bed", entityId: updated.id,
    } });
    res.json({ data: updated });
  }));
  router.post("/beds/:id/archive", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const bed = await db.bed.findFirst({ where: { id: uuidParam(req.params.id), room: { property: { organizationId: req.context!.organizationId } } } });
    if (!bed) throw apiError(404, "NOT_FOUND", "Bed not found.");
    if (await db.occupancy.count({ where: { bedId: bed.id, status: "ACTIVE" } })) throw apiError(409, "BED_OCCUPIED", "Check out the current tenant before deactivating this bed.");
    const updated = await db.bed.update({ where: { id: bed.id }, data: { status: "INACTIVE" } });
    await db.auditLog.create({ data: {
      organizationId: req.context!.organizationId, userId: req.context!.userId,
      action: "BED_ARCHIVED", entityType: "Bed", entityId: bed.id,
    } });
    res.json({ data: updated });
  }));

  router.get("/tenants", requireAuth, asyncRoute(async (req, res) => {
    const page = pagination(req.query);
    const where: Prisma.TenantWhereInput = {
      organizationId: req.context!.organizationId,
      ...(page.search ? { OR: [
        { fullName: { contains: page.search, mode: "insensitive" } },
        { phone: { contains: page.search } },
        { email: { contains: page.search, mode: "insensitive" } },
      ] } : {}),
    };
    const [data, total] = await Promise.all([
      db.tenant.findMany({
        where, skip: page.skip, take: page.pageSize, orderBy: { fullName: page.sortOrder },
        include: { occupancies: { where: { status: "ACTIVE" }, include: { bed: { include: { room: { include: { property: true } } } } } } },
      }),
      db.tenant.count({ where }),
    ]);
    res.json({ data, meta: { page: page.page, pageSize: page.pageSize, total, pageCount: Math.ceil(total / page.pageSize) } });
  }));
  router.post("/tenants", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const input = tenantSchema.parse(req.body);
    const tenant = await db.$transaction(async (tx) => {
      const created = await tx.tenant.create({ data: { ...input, organizationId: req.context!.organizationId } });
      await tx.auditLog.create({ data: {
        organizationId: req.context!.organizationId, userId: req.context!.userId,
        action: "TENANT_CREATED", entityType: "Tenant", entityId: created.id,
      } });
      return created;
    });
    res.status(201).json({ data: tenant });
  }));
  router.get("/occupancies", requireAuth, asyncRoute(async (req, res) => {
    const status = req.query.status === "all" ? undefined : "ACTIVE";
    const data = await db.occupancy.findMany({
      where: { ...(status ? { status } : {}), bed: { room: { property: { organizationId: req.context!.organizationId } } } },
      orderBy: { checkIn: "desc" }, take: 100,
      include: { tenant: true, bed: { include: { room: { include: { property: true } } } } },
    });
    res.json({ data });
  }));
  router.post("/occupancies", requireAuth, requireRoles(...managementRoles), asyncRoute(async (req, res) => {
    const input = occupancySchema.parse(req.body);
    try {
      const occupancy = await db.$transaction(async (tx) => {
        const tenant = await tx.tenant.findFirst({
          where: { id: input.tenantId, organizationId: req.context!.organizationId },
          select: { id: true },
        });
        if (!tenant) throw apiError(404, "TENANT_NOT_FOUND", "Tenant not found.");
        const lockedBeds = await tx.$queryRaw<{ id: string }[]>`
          SELECT b."id"
          FROM "Bed" b
          JOIN "Room" r ON r."id" = b."roomId"
          JOIN "Property" p ON p."id" = r."propertyId"
          WHERE b."id" = ${input.bedId}::uuid
            AND b."organizationId" = ${req.context!.organizationId}::uuid
            AND b."status" = 'AVAILABLE'
            AND r."status" = 'ACTIVE'
            AND p."status" = 'ACTIVE'
          FOR UPDATE OF b
        `;
        if (lockedBeds.length === 0) throw apiError(409, "BED_UNAVAILABLE", "This bed is not available for a new occupancy.");
        const activeOccupancy = await tx.occupancy.findFirst({
          where: { bedId: input.bedId, status: "ACTIVE" },
          select: { id: true },
        });
        if (activeOccupancy) throw apiError(409, "BED_UNAVAILABLE", "This bed is not available for a new occupancy.");
        const created = await tx.occupancy.create({
          data: {
            organizationId: req.context!.organizationId, tenantId: input.tenantId, bedId: input.bedId, checkIn: input.checkIn,
            plannedCheckOut: input.plannedCheckOut, agreedMonthlyRent: input.agreedMonthlyRent,
            agreedDeposit: input.agreedDeposit,
          },
          include: { tenant: true, bed: true },
        });
        await tx.auditLog.create({ data: {
          organizationId: req.context!.organizationId, userId: req.context!.userId,
          action: "OCCUPANCY_CREATED", entityType: "Occupancy", entityId: created.id,
        } });
        return created;
      });
      res.status(201).json({ data: occupancy });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2004" || error.code === "P2034")) {
        throw apiError(409, "BED_DATE_CONFLICT", "This bed already has an overlapping occupancy.");
      }
      throw error;
    }
  }));
  router.post("/occupancies/:id/checkout", requireAuth, requireRoles("OWNER", "PROPERTY_MANAGER", "CARETAKER", "PLATFORM_ADMIN"), asyncRoute(async (req, res) => {
    const input = z.object({ actualCheckOut: z.coerce.date().default(new Date()) }).parse(req.body);
    const occupancy = await db.occupancy.findFirst({
      where: { id: uuidParam(req.params.id), status: "ACTIVE", bed: { room: { property: { organizationId: req.context!.organizationId } } } },
    });
    if (!occupancy) throw apiError(404, "NOT_FOUND", "Active occupancy not found.");
    if (input.actualCheckOut < occupancy.checkIn) throw apiError(400, "INVALID_CHECKOUT_DATE", "Check-out cannot be before check-in.");
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.occupancy.update({
        where: { id: occupancy.id },
        data: { actualCheckOut: input.actualCheckOut, status: "CHECKED_OUT" },
      });
      await tx.auditLog.create({ data: {
        organizationId: req.context!.organizationId, userId: req.context!.userId,
        action: "OCCUPANCY_CHECKED_OUT", entityType: "Occupancy", entityId: row.id,
      } });
      return row;
    });
    res.json({ data: updated });
  }));

  app.use("/api/v1", router);
  const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Please correct the highlighted fields.", details: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) } });
      return;
    }
    const known = error as { status?: number; code?: string; details?: unknown; message?: string };
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        res.status(409).json({ error: { code: "DUPLICATE_VALUE", message: "A record with one of these values already exists.", details: [] } });
        return;
      }
      if (error.code === "P2003" || error.code === "P2004") {
        res.status(409).json({ error: { code: "DATA_CONSTRAINT", message: "This change conflicts with related records or a data-integrity rule.", details: [] } });
        return;
      }
    }
    const status = known.status || 500;
    const code = known.code || "INTERNAL_ERROR";
    const message = status >= 500 ? "An unexpected server error occurred." : known.message || "The request could not be completed.";
    appLogger(status >= 500 ? "error" : "warn", "request_error", {
      requestId: res.getHeader("x-request-id"), method: req.method, path: req.path, status,
      ...(status >= 500 ? { error: error instanceof Error ? error.message : String(error) } : {}),
    });
    res.status(status).json({ error: { code, message, details: known.details || [] } });
  };
  app.use(errorHandler);
  return app;

  function requireAuth(req: Request, _res: Response, next: NextFunction) {
    const userId = req.session.userId;
    const organizationId = req.session.organizationId;
    if (!userId || !organizationId) return next(apiError(401, "UNAUTHORIZED", "Sign in to access this resource."));
    db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    }).then((membership) => {
      if (!membership) return next(apiError(403, "FORBIDDEN", "You do not have access to this organization."));
      (req as ContextRequest).context = { userId, organizationId, role: membership.role };
      return next();
    }).catch(next);
  }
}

function publicUser(user: { id: string; email: string; fullName: string; phone: string | null }) {
  return { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone };
}

function uuidParam(value: unknown) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw apiError(400, "INVALID_ID", "A valid resource ID is required.");
  return parsed.data;
}

const openApiDocument = {
  openapi: "3.0.3",
  info: { title: "Pg Planner Property Management API", version: "1.0.0" },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/auth/register": { post: { summary: "Register an owner and organization", responses: { "201": { description: "Account created" }, "400": { description: "Validation error" } } } },
    "/auth/login": { post: { summary: "Sign in", responses: { "200": { description: "Session started" }, "401": { description: "Invalid credentials" } } } },
    "/auth/logout": { post: { summary: "Sign out", responses: { "200": { description: "Session invalidated" } } } },
    "/auth/me": { get: { summary: "Current user and CSRF token", responses: { "200": { description: "Session profile" } } } },
    "/dashboard/summary": { get: { summary: "Real organization dashboard totals", responses: { "200": { description: "Dashboard summary" } } } },
    "/dashboard/occupancy": { get: { summary: "Bed availability and property occupancy", responses: { "200": { description: "Occupancy charts" } } } },
    "/dashboard/recent-activity": { get: { summary: "Recent check-ins and check-outs", responses: { "200": { description: "Recent occupancy activity" } } } },
    "/properties": { get: { summary: "List, search and paginate properties", responses: { "200": { description: "Property page" } } }, post: { summary: "Create a property", responses: { "201": { description: "Property created" } } } },
    "/properties/{id}": { get: { summary: "Property, rooms and beds", responses: { "200": { description: "Property detail" } } }, patch: { summary: "Update a property", responses: { "200": { description: "Property updated" } } } },
    "/properties/{id}/archive": { post: { summary: "Archive a property without deleting history", responses: { "200": { description: "Property archived" } } } },
    "/properties/{propertyId}/rooms": { get: { summary: "List property rooms", responses: { "200": { description: "Rooms" } } }, post: { summary: "Create a room", responses: { "201": { description: "Room created" } } } },
    "/rooms/{id}": { get: { summary: "Room and bed detail", responses: { "200": { description: "Room" } } }, patch: { summary: "Update room", responses: { "200": { description: "Room updated" } } } },
    "/rooms/{id}/archive": { post: { summary: "Deactivate room", responses: { "200": { description: "Room deactivated" } } } },
    "/rooms/{roomId}/beds": { get: { summary: "List beds and derived occupancy status", responses: { "200": { description: "Beds" } } }, post: { summary: "Create a bed", responses: { "201": { description: "Bed created" } } } },
    "/beds/{id}": { get: { summary: "Bed detail", responses: { "200": { description: "Bed" } } }, patch: { summary: "Update bed", responses: { "200": { description: "Bed updated" } } } },
    "/beds/{id}/archive": { post: { summary: "Deactivate bed", responses: { "200": { description: "Bed deactivated" } } } },
    "/tenants": { get: { summary: "List tenants", responses: { "200": { description: "Tenants" } } }, post: { summary: "Create tenant", responses: { "201": { description: "Tenant created" } } } },
    "/occupancies": { get: { summary: "List organization occupancies", responses: { "200": { description: "Occupancies" } } }, post: { summary: "Assign a tenant to a bed", responses: { "201": { description: "Occupancy created" }, "409": { description: "Overlapping occupancy" } } } },
    "/occupancies/{id}/checkout": { post: { summary: "Check out an active tenant", responses: { "200": { description: "Occupancy ended" } } } },
  },
};

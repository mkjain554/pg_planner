import { afterAll, beforeAll, describe, expect, it } from "vitest";

const integrationUrl = process.env.INTEGRATION_DATABASE_URL;
if (integrationUrl) {
  const databaseName = decodeURIComponent(new URL(integrationUrl).pathname.slice(1));
  if (!databaseName.endsWith("_test")) {
    throw new Error("INTEGRATION_DATABASE_URL must point to a dedicated database whose name ends in _test.");
  }
  process.env.DATABASE_URL = integrationUrl;
}
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.SESSION_SECRET ||= "test-only-session-secret-1234567890";
process.env.NODE_ENV = "test";

const [{ createApp }, { prisma }, { default: request }] = await Promise.all([
  import("./app.js"),
  import("./prisma.js"),
  import("supertest"),
]);

const runDatabaseTests = Boolean(integrationUrl);

describe.skipIf(!runDatabaseTests)("PostgreSQL owner workflows", () => {
  const app = createApp();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emailA = `owner-a-${suffix}@example.test`;
  const emailB = `owner-b-${suffix}@example.test`;
  let organizationA: string;
  let organizationB: string;
  let csrfA = "";
  let csrfB = "";
  const agentA = request.agent(app);
  const agentB = request.agent(app);

  async function post(agent: typeof agentA, path: string, token: string, body: object) {
    return agent.post(`/api/v1/${path}`).set("X-CSRF-Token", token).send(body);
  }

  beforeAll(async () => {
    await prisma.$connect();
  }, 30_000);

  afterAll(async () => {
    const organizationIds = [organizationA, organizationB].filter(Boolean);
    if (organizationIds.length) {
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.deleteMany({ where: { organizationId: { in: organizationIds } } });
        await tx.occupancy.deleteMany({ where: { organizationId: { in: organizationIds } } });
        await tx.bed.deleteMany({ where: { organizationId: { in: organizationIds } } });
        await tx.room.deleteMany({ where: { organizationId: { in: organizationIds } } });
        await tx.property.deleteMany({ where: { organizationId: { in: organizationIds } } });
        await tx.tenant.deleteMany({ where: { organizationId: { in: organizationIds } } });
        await tx.organizationMember.deleteMany({ where: { organizationId: { in: organizationIds } } });
        await tx.organization.deleteMany({ where: { id: { in: organizationIds } } });
        await tx.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
      });
    }
    await prisma.$disconnect();
  });

  it("isolates organizations, persists inventory, derives dashboard totals and serializes bed conflicts", async () => {
    const registrationA = await agentA.post("/api/v1/auth/register").send({
      fullName: "Owner Alpha", organizationName: `Alpha ${suffix}`, email: emailA, password: "AlphaSecure!123",
    });
    expect(registrationA.status).toBe(201);
    organizationA = registrationA.body.data.organization.id;
    csrfA = registrationA.body.data.csrfToken;

    const registrationB = await agentB.post("/api/v1/auth/register").send({
      fullName: "Owner Beta", organizationName: `Beta ${suffix}`, email: emailB, password: "BetaSecure!123",
    });
    expect(registrationB.status).toBe(201);
    organizationB = registrationB.body.data.organization.id;
    csrfB = registrationB.body.data.csrfToken;

    const propertyPayload = {
      name: "Alpha House", code: `ALPHA-${suffix}`, type: "PG", addressLine1: "12 Market Road",
      locality: "Koramangala", city: "Bengaluru", state: "Karnataka", postalCode: "560034",
    };
    const createdProperty = await post(agentA, "properties", csrfA, propertyPayload);
    expect(createdProperty.status).toBe(201);
    const propertyId = createdProperty.body.data.id as string;
    expect((await post(agentA, "properties", csrfA, propertyPayload)).status).toBe(409);

    expect((await agentB.get(`/api/v1/properties/${propertyId}`)).status).toBe(404);
    expect((await agentB.patch(`/api/v1/properties/${propertyId}`).set("X-CSRF-Token", csrfB).send({ name: "Stolen" })).status).toBe(404);
    expect((await agentB.get("/api/v1/properties")).body.meta.total).toBe(0);

    const roomResponse = await post(agentA, `properties/${propertyId}/rooms`, csrfA, {
      identifier: "101", floor: "Ground", type: "DOUBLE", capacity: 2,
    });
    expect(roomResponse.status).toBe(201);
    const roomId = roomResponse.body.data.id as string;
    expect((await post(agentA, `properties/${propertyId}/rooms`, csrfA, {
      identifier: "101", floor: "Ground", type: "DOUBLE", capacity: 2,
    })).status).toBe(409);

    const bedResponse = await post(agentA, `rooms/${roomId}/beds`, csrfA, {
      label: "A", monthlyRent: "12000.37", depositAmount: "20000.09",
    });
    expect(bedResponse.status).toBe(201);
    expect(bedResponse.body.data).toMatchObject({ monthlyRent: "12000.37", depositAmount: "20000.09" });
    const bedId = bedResponse.body.data.id as string;
    expect((await post(agentA, `rooms/${roomId}/beds`, csrfA, {
      label: "A", monthlyRent: "12000.37", depositAmount: "20000.09",
    })).status).toBe(409);

    const tenantResponse = await post(agentA, "tenants", csrfA, {
      fullName: "Sample Tenant", phone: `+91${suffix.replaceAll("-", "").slice(-10)}`,
    });
    expect(tenantResponse.status).toBe(201);
    const checkIn = new Date();
    checkIn.setDate(checkIn.getDate() + 7);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + 30);
    const occupancyPayload = {
      tenantId: tenantResponse.body.data.id, bedId, checkIn, plannedCheckOut: checkOut,
      agreedMonthlyRent: "12000.37", agreedDeposit: "20000.09",
    };
    const concurrent = await Promise.all([
      post(agentA, "occupancies", csrfA, occupancyPayload),
      post(agentA, "occupancies", csrfA, occupancyPayload),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409]);

    const summary = await agentA.get("/api/v1/dashboard/summary");
    expect(summary.body.data).toMatchObject({
      totalProperties: 1, totalRooms: 1, totalBeds: 1, occupiedBeds: 1, vacantBeds: 0, activeTenants: 1,
      expectedMonthlyRent: "12000.37",
    });
    const archiveWhileOccupied = await post(agentA, `properties/${propertyId}/archive`, csrfA, {});
    expect(archiveWhileOccupied.status).toBe(409);

    const activeOccupancy = (await agentA.get("/api/v1/occupancies")).body.data[0];
    const actualCheckOut = new Date(checkIn);
    actualCheckOut.setDate(actualCheckOut.getDate() + 15);
    expect((await post(agentA, `occupancies/${activeOccupancy.id}/checkout`, csrfA, { actualCheckOut })).status).toBe(200);
    expect((await post(agentA, `properties/${propertyId}/archive`, csrfA, {})).status).toBe(200);
    expect((await agentA.get(`/api/v1/properties/${propertyId}`)).status).toBe(200);
    expect((await agentA.get("/api/v1/properties?status=ARCHIVED")).body.meta.total).toBe(1);
  }, 30_000);
});

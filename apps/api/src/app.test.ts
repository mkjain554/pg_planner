import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.SESSION_SECRET ||= "test-only-session-secret-1234567890";
process.env.NODE_ENV = "test";

const [{ createApp }, { default: request }, { default: session }] = await Promise.all([
  import("./app.js"),
  import("supertest"),
  import("express-session"),
]);

const app = createApp(undefined, { sessionStore: new session.MemoryStore() });

describe("API foundation", () => {
  it("reports a healthy process without requiring demo data", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns structured errors for protected resources", async () => {
    const response = await request(app).get("/api/v1/dashboard/summary");
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({ code: "UNAUTHORIZED", message: expect.any(String), details: [] });
  });

  it("validates registration before attempting persistence", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({ email: "not-an-email", password: "short" });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "VALIDATION_ERROR", details: expect.any(Array) });
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it("serves the OpenAPI document", async () => {
    const response = await request(app).get("/api/docs/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.paths["/properties"]).toBeDefined();
  });
});

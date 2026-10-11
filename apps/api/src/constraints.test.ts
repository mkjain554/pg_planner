import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20261011000000_initial/migration.sql"), "utf8");

describe("PostgreSQL integrity constraints", () => {
  it("enforces non-overlapping active stays at the database layer", () => {
    expect(migration).toContain('EXCLUDE USING gist');
    expect(migration).toContain('"occupancy_no_active_date_overlap"');
    expect(migration).toContain('WHERE ("status" = \'ACTIVE\')');
  });

  it("ties room, bed and occupancy records to the same organization", () => {
    expect(schema).toContain('fields: [propertyId, organizationId], references: [id, organizationId]');
    expect(schema).toContain('fields: [roomId, organizationId], references: [id, organizationId]');
    expect(schema).toContain('fields: [tenantId, organizationId], references: [id, organizationId]');
    expect(migration).toContain('"Occupancy_bedId_organizationId_fkey"');
  });

  it("uses decimal database types for rent and deposit amounts", () => {
    expect(schema).toContain('monthlyRent   Decimal    @db.Decimal(12, 2)');
    expect(schema).toContain('agreedMonthlyRent     Decimal         @db.Decimal(12, 2)');
  });
});

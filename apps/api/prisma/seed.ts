import "dotenv/config";
import { hash } from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed is disabled in production.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed the development database.");
}

const prisma = new PrismaClient();
const email = "owner@example.test";
const organizationSlug = "maple-living-demo";

async function main() {
  const passwordHash = await hash("PgPlannerLocal!2026", 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { fullName: "Alex Morgan", passwordHash },
    create: { email, fullName: "Alex Morgan", passwordHash },
  });
  const organization = await prisma.organization.upsert({
    where: { slug: organizationSlug },
    update: { name: "Maple Living Demo" },
    create: { name: "Maple Living Demo", slug: organizationSlug },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: { role: "OWNER" },
    create: { organizationId: organization.id, userId: user.id, role: "OWNER" },
  });

  const propertyDefinitions = [
    { name: "Maple Residency", code: "MAPLE-01", locality: "Koramangala", city: "Bengaluru", addressLine1: "18th Main Road", state: "Karnataka", postalCode: "560034" },
    { name: "The Blue House", code: "BLUE-02", locality: "Indiranagar", city: "Bengaluru", addressLine1: "12th Cross Road", state: "Karnataka", postalCode: "560038" },
  ];
  const properties = [];
  for (const definition of propertyDefinitions) {
    const property = await prisma.property.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: definition.code } },
      update: definition,
      create: { ...definition, organizationId: organization.id, type: "PG", country: "India", currency: "INR" },
    });
    properties.push(property);
  }

  const rooms = [];
  for (const [propertyIndex, property] of properties.entries()) {
    for (let roomNumber = 1; roomNumber <= 3; roomNumber += 1) {
      const room = await prisma.room.upsert({
        where: { propertyId_identifier: { propertyId: property.id, identifier: `${propertyIndex + 1}0${roomNumber}` } },
        update: { floor: roomNumber === 3 ? "First" : "Ground", capacity: 2, type: "DOUBLE", status: "ACTIVE" },
        create: {
          propertyId: property.id, organizationId: organization.id, identifier: `${propertyIndex + 1}0${roomNumber}`,
          floor: roomNumber === 3 ? "First" : "Ground", capacity: 2, type: "DOUBLE",
        },
      });
      rooms.push(room);
      for (const label of ["A", "B"]) {
        await prisma.bed.upsert({
          where: { roomId_label: { roomId: room.id, label } },
          update: { monthlyRent: new Prisma.Decimal(12500), depositAmount: new Prisma.Decimal(25000), status: "AVAILABLE" },
          create: {
            roomId: room.id, organizationId: organization.id, label,
            monthlyRent: new Prisma.Decimal(12500), depositAmount: new Prisma.Decimal(25000),
          },
        });
      }
    }
  }

  const tenantDefinitions = [
    { fullName: "Samira Patel", phone: "+91 98765 10001", email: "samira@example.test" },
    { fullName: "Dev Sharma", phone: "+91 98765 10002", email: "dev@example.test" },
    { fullName: "Riya Nair", phone: "+91 98765 10003", email: "riya@example.test" },
  ];
  const tenants = [];
  for (const definition of tenantDefinitions) {
    let tenant = await prisma.tenant.findFirst({ where: { organizationId: organization.id, phone: definition.phone } });
    tenant = tenant
      ? await prisma.tenant.update({ where: { id: tenant.id }, data: definition })
      : await prisma.tenant.create({ data: { ...definition, organizationId: organization.id } });
    tenants.push(tenant);
  }

  const firstBed = await prisma.bed.findFirst({ where: { roomId: rooms[0]!.id, label: "A" } });
  const secondBed = await prisma.bed.findFirst({ where: { roomId: rooms[1]!.id, label: "A" } });
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() - 18);
  checkIn.setUTCHours(0, 0, 0, 0);
  const plannedCheckOut = new Date(checkIn);
  plannedCheckOut.setDate(plannedCheckOut.getDate() + 120);
  const seedOccupancies = [
    { tenantId: tenants[0]!.id, bedId: firstBed!.id },
    { tenantId: tenants[1]!.id, bedId: secondBed!.id },
  ];
  for (const occupancy of seedOccupancies) {
    const existing = await prisma.occupancy.findFirst({
      where: { organizationId: organization.id, tenantId: occupancy.tenantId, bedId: occupancy.bedId, status: "ACTIVE" },
    });
    if (!existing) {
      await prisma.occupancy.create({
        data: {
          ...occupancy, organizationId: organization.id, checkIn, plannedCheckOut,
          agreedMonthlyRent: new Prisma.Decimal(12500), agreedDeposit: new Prisma.Decimal(25000), status: "ACTIVE",
        },
      });
    }
  }

  console.info(`Seeded ${organization.name}. Sign in with ${email} / PgPlannerLocal!2026 (local development only).`);
}

main()
  .catch((error: unknown) => {
    console.error("Development seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

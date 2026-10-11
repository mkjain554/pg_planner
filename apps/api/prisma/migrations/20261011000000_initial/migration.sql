CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE "MemberRole" AS ENUM ('PLATFORM_ADMIN', 'OWNER', 'PROPERTY_MANAGER', 'CARETAKER');
CREATE TYPE "PropertyType" AS ENUM ('PG', 'HOSTEL', 'CO_LIVING');
CREATE TYPE "PropertyStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');
CREATE TYPE "RoomType" AS ENUM ('SINGLE', 'DOUBLE', 'TRIPLE', 'DORMITORY', 'OTHER');
CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE', 'INACTIVE');
CREATE TYPE "OccupancyStatus" AS ENUM ('ACTIVE', 'CHECKED_OUT', 'CANCELLED');

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "email" VARCHAR(320) NOT NULL, "fullName" VARCHAR(160) NOT NULL,
  "phone" VARCHAR(32), "passwordHash" VARCHAR(255) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Organization" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(160) NOT NULL, "slug" VARCHAR(180) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrganizationMember" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organizationId" UUID NOT NULL, "userId" UUID NOT NULL,
  "role" "MemberRole" NOT NULL DEFAULT 'OWNER', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Property" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organizationId" UUID NOT NULL, "name" VARCHAR(160) NOT NULL,
  "code" VARCHAR(40) NOT NULL, "type" "PropertyType" NOT NULL DEFAULT 'PG', "addressLine1" VARCHAR(200) NOT NULL,
  "addressLine2" VARCHAR(200), "locality" VARCHAR(120) NOT NULL, "city" VARCHAR(120) NOT NULL,
  "state" VARCHAR(120) NOT NULL, "postalCode" VARCHAR(16) NOT NULL, "country" VARCHAR(80) NOT NULL DEFAULT 'India',
  "description" VARCHAR(1000), "contactName" VARCHAR(120), "contactPhone" VARCHAR(32),
  "defaultBillingDay" INTEGER NOT NULL DEFAULT 1, "currency" CHAR(3) NOT NULL DEFAULT 'INR',
  "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Room" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "propertyId" UUID NOT NULL, "organizationId" UUID NOT NULL, "identifier" VARCHAR(40) NOT NULL,
  "floor" VARCHAR(40) NOT NULL, "type" "RoomType" NOT NULL DEFAULT 'OTHER', "capacity" INTEGER NOT NULL,
  "description" VARCHAR(600), "status" "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id"), CONSTRAINT "Room_capacity_check" CHECK ("capacity" > 0)
);
CREATE TABLE "Bed" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "roomId" UUID NOT NULL, "organizationId" UUID NOT NULL, "label" VARCHAR(40) NOT NULL,
  "code" VARCHAR(40), "monthlyRent" DECIMAL(12,2) NOT NULL, "depositAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE', "notes" VARCHAR(600),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bed_pkey" PRIMARY KEY ("id"), CONSTRAINT "Bed_rent_check" CHECK ("monthlyRent" >= 0),
  CONSTRAINT "Bed_deposit_check" CHECK ("depositAmount" >= 0)
);
CREATE TABLE "Tenant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organizationId" UUID NOT NULL, "userId" UUID,
  "fullName" VARCHAR(160) NOT NULL, "phone" VARCHAR(32) NOT NULL, "email" VARCHAR(320),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Occupancy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organizationId" UUID NOT NULL, "tenantId" UUID NOT NULL, "bedId" UUID NOT NULL,
  "checkIn" DATE NOT NULL, "plannedCheckOut" DATE, "actualCheckOut" DATE,
  "agreedMonthlyRent" DECIMAL(12,2) NOT NULL, "agreedDeposit" DECIMAL(12,2) NOT NULL,
  "status" "OccupancyStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Occupancy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Occupancy_dates_check" CHECK ("plannedCheckOut" IS NULL OR "plannedCheckOut" > "checkIn"),
  CONSTRAINT "Occupancy_actual_date_check" CHECK ("actualCheckOut" IS NULL OR "actualCheckOut" >= "checkIn"),
  CONSTRAINT "Occupancy_rent_check" CHECK ("agreedMonthlyRent" >= 0 AND "agreedDeposit" >= 0)
);
CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organizationId" UUID NOT NULL, "userId" UUID,
  "action" VARCHAR(100) NOT NULL, "entityType" VARCHAR(80) NOT NULL, "entityId" UUID, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");
CREATE UNIQUE INDEX "Property_organizationId_code_key" ON "Property"("organizationId", "code");
CREATE UNIQUE INDEX "Property_id_organizationId_key" ON "Property"("id", "organizationId");
CREATE INDEX "Property_organizationId_status_createdAt_idx" ON "Property"("organizationId", "status", "createdAt");
CREATE INDEX "Property_organizationId_city_idx" ON "Property"("organizationId", "city");
CREATE UNIQUE INDEX "Room_propertyId_identifier_key" ON "Room"("propertyId", "identifier");
CREATE UNIQUE INDEX "Room_id_organizationId_key" ON "Room"("id", "organizationId");
CREATE INDEX "Room_propertyId_floor_status_idx" ON "Room"("propertyId", "floor", "status");
CREATE UNIQUE INDEX "Bed_roomId_label_key" ON "Bed"("roomId", "label");
CREATE UNIQUE INDEX "Bed_id_organizationId_key" ON "Bed"("id", "organizationId");
CREATE INDEX "Bed_roomId_status_idx" ON "Bed"("roomId", "status");
CREATE INDEX "Tenant_organizationId_fullName_idx" ON "Tenant"("organizationId", "fullName");
CREATE INDEX "Tenant_organizationId_phone_idx" ON "Tenant"("organizationId", "phone");
CREATE UNIQUE INDEX "Tenant_id_organizationId_key" ON "Tenant"("id", "organizationId");
CREATE INDEX "Occupancy_organizationId_status_checkIn_idx" ON "Occupancy"("organizationId", "status", "checkIn");
CREATE INDEX "Occupancy_bedId_status_checkIn_idx" ON "Occupancy"("bedId", "status", "checkIn");
CREATE INDEX "Occupancy_tenantId_status_idx" ON "Occupancy"("tenantId", "status");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Property" ADD CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_propertyId_organizationId_fkey" FOREIGN KEY ("propertyId", "organizationId") REFERENCES "Property"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_roomId_organizationId_fkey" FOREIGN KEY ("roomId", "organizationId") REFERENCES "Room"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Occupancy" ADD CONSTRAINT "Occupancy_tenantId_organizationId_fkey" FOREIGN KEY ("tenantId", "organizationId") REFERENCES "Tenant"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Occupancy" ADD CONSTRAINT "Occupancy_bedId_organizationId_fkey" FOREIGN KEY ("bedId", "organizationId") REFERENCES "Bed"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Occupancy" ADD CONSTRAINT "occupancy_no_active_date_overlap"
  EXCLUDE USING gist (
    "bedId" WITH =,
    daterange("checkIn", COALESCE("plannedCheckOut", 'infinity'::date), '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');

CREATE FUNCTION reject_room_capacity_below_beds() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."capacity" < (SELECT count(*) FROM "Bed" WHERE "roomId" = NEW."id") THEN
    RAISE EXCEPTION 'Room capacity cannot be lower than its current bed count'
      USING ERRCODE = '23514', CONSTRAINT = 'Room_capacity_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Room_capacity_guard" BEFORE UPDATE OF "capacity" ON "Room"
  FOR EACH ROW EXECUTE FUNCTION reject_room_capacity_below_beds();

CREATE FUNCTION reject_bed_over_room_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bed_count INTEGER; room_capacity INTEGER; room_status "RoomStatus"; property_status "PropertyStatus";
BEGIN
  SELECT "Room"."capacity", "Room"."status", "Property"."status"
  INTO room_capacity, room_status, property_status
  FROM "Room" JOIN "Property" ON "Property"."id" = "Room"."propertyId"
  WHERE "Room"."id" = NEW."roomId"
  FOR UPDATE OF "Room";
  SELECT count(*) INTO bed_count FROM "Bed" WHERE "roomId" = NEW."roomId";
  IF bed_count >= room_capacity THEN
    RAISE EXCEPTION 'Room capacity has been reached'
      USING ERRCODE = '23514', CONSTRAINT = 'Room_capacity_check';
  END IF;
  IF room_status <> 'ACTIVE' OR property_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Beds cannot be added to inactive rooms or properties'
      USING ERRCODE = '23514', CONSTRAINT = 'Room_status_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Bed_room_capacity_guard" BEFORE INSERT ON "Bed"
  FOR EACH ROW EXECUTE FUNCTION reject_bed_over_room_capacity();

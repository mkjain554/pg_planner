import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatINR, OccupancyForm, PropertyForm } from "./forms";

afterEach(cleanup);

describe("property forms", () => {
  it("shows accessible field validation before submitting", async () => {
    render(<PropertyForm onClose={vi.fn()} onSubmit={vi.fn()} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Create property" }));
    await waitFor(() => expect(screen.getByText("Enter at least 2 characters.")).toBeInTheDocument());
    expect(screen.getByText("Enter the property address.")).toBeInTheDocument();
  });

  it("formats rupee amounts using the Indian locale", () => {
    expect(formatINR("12500.00")).toContain("12,500");
    expect(formatINR("12500.00")).toContain("₹");
  });

  it("offers to add a bed to an active room when no beds are available", () => {
    const onAddBed = vi.fn();
    render(<OccupancyForm
      tenants={[]}
      beds={[]}
      rooms={[{
        id: "room-1",
        propertyId: "property-1",
        property: {
          id: "property-1",
          name: "Maple House",
          code: "MAPLE",
          type: "PG",
          addressLine1: "1 Main Road",
          addressLine2: null,
          locality: "Central",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "India",
          description: null,
          contactName: null,
          contactPhone: null,
          defaultBillingDay: 1,
          currency: "INR",
          status: "ACTIVE",
        },
        identifier: "101",
        floor: "Ground",
        type: "DOUBLE",
        capacity: 2,
        status: "ACTIVE",
        bedCount: 0,
        beds: [],
      }]}
      onClose={vi.fn()}
      onAddBed={onAddBed}
      onSubmit={vi.fn()}
      busy={false}
    />);

    expect(screen.getByRole("status")).toHaveTextContent("No beds are currently available.");
    fireEvent.click(screen.getAllByRole("button", { name: "Add a bed · Maple House · Room 101" })[0]!);
    expect(onAddBed).toHaveBeenCalledWith("property-1", "room-1");
  });

  it("still offers the newly added room when beds are available elsewhere", () => {
    const property = {
      id: "property-1",
      name: "Maple House",
      code: "MAPLE",
      type: "PG" as const,
      addressLine1: "1 Main Road",
      addressLine2: null,
      locality: "Central",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
      description: null,
      contactName: null,
      contactPhone: null,
      defaultBillingDay: 1,
      currency: "INR",
      status: "ACTIVE" as const,
    };
    const room = {
      id: "room-1",
      propertyId: property.id,
      property,
      identifier: "101",
      floor: "Ground",
      type: "DOUBLE",
      capacity: 2,
      status: "ACTIVE" as const,
      beds: [],
    };
    const onAddBed = vi.fn();
    render(<OccupancyForm
      tenants={[]}
      beds={[{
        id: "bed-1",
        roomId: room.id,
        room,
        label: "A",
        code: null,
        monthlyRent: "12000.00",
        depositAmount: "20000.00",
        status: "AVAILABLE",
        notes: null,
      }]}
      rooms={[room]}
      onClose={vi.fn()}
      onAddBed={onAddBed}
      onSubmit={vi.fn()}
      busy={false}
    />);

    expect(screen.getByRole("option", { name: "Maple House · Room 101 · Bed A" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Add a bed · Maple House · Room 101" })[0]!);
    expect(onAddBed).toHaveBeenCalledWith("property-1", "room-1");
  });
});

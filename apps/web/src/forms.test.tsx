import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatINR, PropertyForm } from "./forms";

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
});

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { ApiError, type Bed, type Property, type Room, type Tenant } from "./api";

type ModalProps = { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode };

export function Modal({ title, eyebrow = "PROPERTY MANAGEMENT", onClose, children }: ModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading">
          <div><span className="eyebrow">{eyebrow}</span><h2 id="modal-title">{title}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>;
}

function ErrorList({ message }: { message?: string }) {
  return message ? <div className="form-error" role="alert">{message}</div> : null;
}

async function submitForm<T extends FieldValues>(
  values: T,
  form: UseFormReturn<T>,
  onSubmit: (data: object) => Promise<void>,
  transform: (data: T) => object = (data) => data,
) {
  try {
    await onSubmit(transform(values));
  } catch (error) {
    if (!(error instanceof ApiError)) {
      form.setError("root.serverError", { type: "server", message: "The request could not be completed. Please try again." });
      return;
    }
    let assignedToField = false;
    for (const detail of error.details) {
      const field = detail.field?.split(".").at(-1);
      if (field && field in form.getValues()) {
        form.setError(field as Path<T>, { type: "server", message: detail.message });
        assignedToField = true;
      }
    }
    if (!assignedToField) form.setError("root.serverError", { type: "server", message: error.message });
  }
}

const propertySchema = z.object({
  name: z.string().min(2, "Enter at least 2 characters."),
  code: z.string().min(2, "Enter a unique property code.").max(40),
  type: z.enum(["PG", "HOSTEL", "CO_LIVING"]),
  addressLine1: z.string().min(2, "Enter the property address."),
  addressLine2: z.string(),
  locality: z.string().min(1, "Enter a locality."),
  city: z.string().min(1, "Enter a city."),
  state: z.string().min(1, "Enter a state."),
  postalCode: z.string().min(3, "Enter a valid postal code."),
  country: z.string().min(1),
  description: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  defaultBillingDay: z.coerce.number().int().min(1).max(28),
});
type PropertyValues = z.infer<typeof propertySchema>;

export function PropertyForm({ property, onClose, onSubmit, busy }: {
  property?: Property; onClose: () => void; onSubmit: (data: object) => Promise<void>; busy: boolean;
}) {
  const form = useForm<PropertyValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: property?.name || "", code: property?.code || "", type: property?.type || "PG",
      addressLine1: property?.addressLine1 || "", addressLine2: property?.addressLine2 || "",
      locality: property?.locality || "", city: property?.city || "", state: property?.state || "",
      postalCode: property?.postalCode || "", country: property?.country || "India",
      description: property?.description || "", contactName: property?.contactName || "",
      contactPhone: property?.contactPhone || "", defaultBillingDay: property?.defaultBillingDay || 1,
    },
  });
  return (
    <Modal title={property ? "Edit property" : "Add a property"} onClose={onClose}>
      <form className="entity-form" onSubmit={form.handleSubmit((values) => submitForm(values, form, onSubmit, (input) => ({
        ...input, addressLine2: input.addressLine2 || null, description: input.description || null,
        contactName: input.contactName || null, contactPhone: input.contactPhone || null, currency: "INR",
      })))}>
        <div className="form-grid two">
          <FormField label="Property name" error={form.formState.errors.name?.message}><input {...form.register("name")} placeholder="e.g. Maple Residency" /></FormField>
          <FormField label="Property code" error={form.formState.errors.code?.message}><input {...form.register("code")} placeholder="e.g. MAPLE-01" /></FormField>
          <FormField label="Property type" error={form.formState.errors.type?.message}><select {...form.register("type")}><option value="PG">Paying guest (PG)</option><option value="HOSTEL">Hostel</option><option value="CO_LIVING">Co-living</option></select></FormField>
          <FormField label="Address line 1" error={form.formState.errors.addressLine1?.message}><input {...form.register("addressLine1")} placeholder="Building and street" /></FormField>
          <FormField label="Address line 2"><input {...form.register("addressLine2")} placeholder="Optional" /></FormField>
          <FormField label="Locality" error={form.formState.errors.locality?.message}><input {...form.register("locality")} placeholder="Neighbourhood" /></FormField>
          <FormField label="City" error={form.formState.errors.city?.message}><input {...form.register("city")} placeholder="City" /></FormField>
          <FormField label="State" error={form.formState.errors.state?.message}><input {...form.register("state")} placeholder="State" /></FormField>
          <FormField label="Postal code" error={form.formState.errors.postalCode?.message}><input {...form.register("postalCode")} placeholder="Postal code" /></FormField>
          <FormField label="Billing day (monthly)" error={form.formState.errors.defaultBillingDay?.message}><input type="number" min="1" max="28" {...form.register("defaultBillingDay")} /></FormField>
          <FormField label="Contact name"><input {...form.register("contactName")} placeholder="Property contact" /></FormField>
          <FormField label="Contact phone"><input {...form.register("contactPhone")} placeholder="+91" /></FormField>
          <FormField label="Description"><textarea className="span-two" rows={3} {...form.register("description")} placeholder="Optional property notes" /></FormField>
        </div>
        <ErrorList message={form.formState.errors.root?.serverError?.message} />
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={busy}>{busy ? "Saving…" : property ? "Save changes" : "Create property"}</button></div>
      </form>
    </Modal>
  );
}

const roomSchema = z.object({
  identifier: z.string().min(1, "Enter a room identifier."),
  floor: z.string().min(1, "Enter a floor."),
  type: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "DORMITORY", "OTHER"]),
  capacity: z.coerce.number().int().min(1).max(100),
  description: z.string(),
});
export function RoomForm({ room, onClose, onSubmit, busy }: {
  room?: Room; onClose: () => void; onSubmit: (data: object) => Promise<void>; busy: boolean;
}) {
  const form = useForm<z.infer<typeof roomSchema>>({
    resolver: zodResolver(roomSchema),
    defaultValues: { identifier: room?.identifier || "", floor: room?.floor || "Ground", type: (room?.type as z.infer<typeof roomSchema>["type"]) || "OTHER", capacity: room?.capacity || 2, description: "" },
  });
  return <Modal title={room ? "Edit room" : "Add a room"} onClose={onClose}><form className="entity-form" onSubmit={form.handleSubmit((values) => submitForm(values, form, onSubmit, (input) => ({ ...input, description: input.description || null })))}>
    <div className="form-grid two">
      <FormField label="Room identifier" error={form.formState.errors.identifier?.message}><input {...form.register("identifier")} placeholder="e.g. 201" /></FormField>
      <FormField label="Floor" error={form.formState.errors.floor?.message}><input {...form.register("floor")} placeholder="e.g. 2nd floor" /></FormField>
      <FormField label="Room type"><select {...form.register("type")}><option value="SINGLE">Single</option><option value="DOUBLE">Double</option><option value="TRIPLE">Triple</option><option value="DORMITORY">Dormitory</option><option value="OTHER">Other</option></select></FormField>
      <FormField label="Bed capacity" error={form.formState.errors.capacity?.message}><input type="number" min="1" {...form.register("capacity")} /></FormField>
      <FormField label="Description"><textarea className="span-two" rows={3} {...form.register("description")} placeholder="Optional notes" /></FormField>
    </div>
    <ErrorList message={form.formState.errors.root?.serverError?.message} />
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : room ? "Save changes" : "Create room"}</button></div>
  </form></Modal>;
}

const bedSchema = z.object({
  label: z.string().min(1, "Enter a bed label."),
  code: z.string(),
  monthlyRent: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 10 digits and 2 decimal places."),
  depositAmount: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 10 digits and 2 decimal places."),
  notes: z.string(),
});
export function BedForm({ bed, onClose, onSubmit, busy }: {
  bed?: Bed; onClose: () => void; onSubmit: (data: object) => Promise<void>; busy: boolean;
}) {
  const form = useForm<z.infer<typeof bedSchema>>({
    resolver: zodResolver(bedSchema),
    defaultValues: { label: bed?.label || "", code: bed?.code || "", monthlyRent: bed?.monthlyRent || "0.00", depositAmount: bed?.depositAmount || "0.00", notes: bed?.notes || "" },
  });
  return <Modal title={bed ? "Edit bed" : "Add a bed"} onClose={onClose}><form className="entity-form" onSubmit={form.handleSubmit((values) => submitForm(values, form, onSubmit, (input) => ({ ...input, code: input.code || null, notes: input.notes || null })))}>
    <div className="form-grid two">
      <FormField label="Bed label" error={form.formState.errors.label?.message}><input {...form.register("label")} placeholder="e.g. A or Bed 01" /></FormField>
      <FormField label="Bed code"><input {...form.register("code")} placeholder="Optional" /></FormField>
      <FormField label="Monthly rent (₹)" error={form.formState.errors.monthlyRent?.message}><input type="number" min="0" step="0.01" {...form.register("monthlyRent")} /></FormField>
      <FormField label="Security deposit (₹)" error={form.formState.errors.depositAmount?.message}><input type="number" min="0" step="0.01" {...form.register("depositAmount")} /></FormField>
      <FormField label="Notes"><textarea className="span-two" rows={3} {...form.register("notes")} placeholder="Optional bed notes" /></FormField>
    </div>
    <ErrorList message={form.formState.errors.root?.serverError?.message} />
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : bed ? "Save changes" : "Create bed"}</button></div>
  </form></Modal>;
}

const tenantSchema = z.object({
  fullName: z.string().min(2, "Enter the tenant's full name."),
  phone: z.string().min(5, "Enter a valid phone number."),
  email: z.string().refine((value) => !value || z.string().email().safeParse(value).success, "Enter a valid email address."),
});
export function TenantForm({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (data: object) => Promise<void>; busy: boolean }) {
  const form = useForm<z.infer<typeof tenantSchema>>({
    resolver: zodResolver(tenantSchema),
    defaultValues: { fullName: "", phone: "", email: "" },
  });
  return <Modal title="Add a tenant" onClose={onClose}><form className="entity-form" onSubmit={form.handleSubmit((values) => submitForm(values, form, onSubmit, (input) => ({ ...input, email: input.email || null })))}>
    <div className="form-grid">
      <FormField label="Full name" error={form.formState.errors.fullName?.message}><input {...form.register("fullName")} autoFocus placeholder="Tenant name" /></FormField>
      <FormField label="Phone number" error={form.formState.errors.phone?.message}><input {...form.register("phone")} placeholder="+91 98765 43210" /></FormField>
      <FormField label="Email"><input type="email" {...form.register("email")} placeholder="Optional email" /></FormField>
    </div>
    <ErrorList message={form.formState.errors.root?.serverError?.message} />
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Create tenant"}</button></div>
  </form></Modal>;
}

const occupancySchema = z.object({
  tenantId: z.string().uuid("Select a tenant."),
  bedId: z.string().uuid("Select a bed."),
  checkIn: z.string().min(1, "Choose a check-in date."),
  plannedCheckOut: z.string(),
  agreedMonthlyRent: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 10 digits and 2 decimal places."),
  agreedDeposit: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 10 digits and 2 decimal places."),
});
export function OccupancyForm({ tenants, beds, onClose, onSubmit, busy }: {
  tenants: Tenant[]; beds: (Bed & { room: Room & { property: Property } })[];
  onClose: () => void; onSubmit: (data: object) => Promise<void>; busy: boolean;
}) {
  const availableBeds = beds.filter((bed) => bed.status === "AVAILABLE");
  const form = useForm<z.infer<typeof occupancySchema>>({
    resolver: zodResolver(occupancySchema),
    defaultValues: { tenantId: "", bedId: "", checkIn: new Date().toISOString().slice(0, 10), plannedCheckOut: "", agreedMonthlyRent: "0.00", agreedDeposit: "0.00" },
  });
  const selectedBed = availableBeds.find((bed) => bed.id === form.watch("bedId"));
  return <Modal title="Check in a tenant" onClose={onClose}><form className="entity-form" onSubmit={form.handleSubmit((values) => submitForm(values, form, onSubmit, (input) => ({
    ...input, checkIn: new Date(`${input.checkIn}T00:00:00.000Z`),
    plannedCheckOut: input.plannedCheckOut ? new Date(`${input.plannedCheckOut}T00:00:00.000Z`) : null,
  })))}>
    <div className="form-grid">
      <FormField label="Tenant"><select {...form.register("tenantId")}><option value="">Choose a tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.fullName} · {tenant.phone}</option>)}</select></FormField>
      <FormField label="Available bed"><select {...form.register("bedId")}><option value="">Choose a bed</option>{availableBeds.map((bed) => <option key={bed.id} value={bed.id}>{bed.room.property.name} · Room {bed.room.identifier} · Bed {bed.label}</option>)}</select>{availableBeds.length === 0 && <small>No available beds yet. Add a property, room and bed first.</small>}</FormField>
      <div className="form-grid two">
        <FormField label="Check-in date"><input type="date" {...form.register("checkIn")} /></FormField>
        <FormField label="Planned check-out"><input type="date" {...form.register("plannedCheckOut")} /></FormField>
        <FormField label="Agreed monthly rent (₹)" error={form.formState.errors.agreedMonthlyRent?.message}><input type="number" min="0" step="0.01" {...form.register("agreedMonthlyRent")} /></FormField>
        <FormField label="Agreed deposit (₹)" error={form.formState.errors.agreedDeposit?.message}><input type="number" min="0" step="0.01" {...form.register("agreedDeposit")} /></FormField>
      </div>
      {selectedBed && <p className="form-hint">Default rent for this bed: {formatINR(selectedBed.monthlyRent)} / month</p>}
    </div>
    <ErrorList message={form.formState.errors.root?.serverError?.message} />
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || availableBeds.length === 0}>{busy ? "Checking in…" : "Confirm check-in"}</button></div>
  </form></Modal>;
}

export function formatINR(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
}

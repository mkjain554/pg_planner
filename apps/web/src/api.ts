export type ApiErrorShape = {
  error: { code: string; message: string; details: { field?: string; message: string }[] };
};

export class ApiError extends Error {
  code: string;
  details: ApiErrorShape["error"]["details"];
  status: number;

  constructor(status: number, body: ApiErrorShape) {
    super(body.error.message);
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details || [];
  }
}

let csrfToken: string | undefined;

export function setCsrfToken(token?: string) {
  csrfToken = token;
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || "GET";
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, credentials: "include" });
  const body = await response.json().catch(() => null) as (T & { error?: ApiErrorShape["error"] }) | null;
  if (!response.ok) {
    throw new ApiError(response.status, {
      error: body?.error || { code: "NETWORK_ERROR", message: response.statusText || "The request failed.", details: [] },
    });
  }
  return body as T;
}

export type User = { id: string; email: string; fullName: string; phone: string | null };
export type Organization = { id: string; name: string };
export type Session = { user: User; organization: Organization; role?: string; csrfToken?: string };
export type Page<T> = { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } };
export type Property = {
  id: string; name: string; code: string; type: "PG" | "HOSTEL" | "CO_LIVING"; addressLine1: string;
  addressLine2: string | null; locality: string; city: string; state: string; postalCode: string;
  country: string; description: string | null; contactName: string | null; contactPhone: string | null;
  defaultBillingDay: number; currency: string; status: "ACTIVE" | "ARCHIVED"; roomCount?: number;
  bedCount?: number; occupiedBeds?: number;
};
export type Room = {
  id: string; propertyId: string; identifier: string; floor: string; type: string; capacity: number;
  status: "ACTIVE" | "MAINTENANCE" | "INACTIVE"; bedCount?: number;
  beds?: Bed[];
};
export type Bed = {
  id: string; roomId: string; label: string; code: string | null; monthlyRent: string;
  depositAmount: string; status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "MAINTENANCE" | "INACTIVE";
  notes: string | null; occupancies?: Occupancy[];
};
export type Tenant = {
  id: string; fullName: string; phone: string; email: string | null;
  occupancies?: Occupancy[];
};
export type Occupancy = {
  id: string; tenant: Tenant; bed: Bed & { room: Room & { property: Property } };
  checkIn: string; plannedCheckOut: string | null; actualCheckOut: string | null;
  agreedMonthlyRent: string; agreedDeposit: string; status: string;
};
export type DashboardSummary = {
  totalProperties: number; totalRooms: number; totalBeds: number; occupiedBeds: number; vacantBeds: number;
  occupancyPercentage: number; activeTenants: number; expectedMonthlyRent: string;
};
export type OccupancyChart = {
  bedStatus: { name: string; value: number; color: string }[];
  byProperty: { id: string; name: string; totalBeds: number; occupiedBeds: number; vacantBeds: number }[];
};

export const routes = {
  me: () => api<{ data: Session }>("/auth/me"),
  login: (input: { email: string; password: string }) => api<{ data: Session }>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  register: (input: { email: string; password: string; fullName: string; organizationName: string }) => api<{ data: Session }>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  logout: () => api("/auth/logout", { method: "POST", body: "{}" }),
  summary: () => api<{ data: DashboardSummary }>("/dashboard/summary"),
  occupancyChart: () => api<{ data: OccupancyChart }>("/dashboard/occupancy"),
  activity: () => api<{ data: { id: string; tenant: string; property: string; room: string; bed: string; action: string; date: string }[] }>("/dashboard/recent-activity"),
  properties: (query: string, page = 1, status = "ACTIVE") => api<Page<Property>>(`/properties?${new URLSearchParams({ search: query, page: String(page), pageSize: "12", status, sortBy: "name" })}`),
  property: (id: string) => api<{ data: Property & { rooms: (Room & { beds: Bed[] })[] } }>(`/properties/${id}`),
  createProperty: (data: object) => api<{ data: Property }>("/properties", { method: "POST", body: JSON.stringify(data) }),
  updateProperty: (id: string, data: object) => api<{ data: Property }>(`/properties/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  archiveProperty: (id: string) => api(`/properties/${id}/archive`, { method: "POST", body: "{}" }),
  rooms: (propertyId: string) => api<{ data: Room[] }>(`/properties/${propertyId}/rooms`),
  createRoom: (propertyId: string, data: object) => api<{ data: Room }>(`/properties/${propertyId}/rooms`, { method: "POST", body: JSON.stringify(data) }),
  updateRoom: (id: string, data: object) => api<{ data: Room }>(`/rooms/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  archiveRoom: (id: string) => api(`/rooms/${id}/archive`, { method: "POST", body: "{}" }),
  beds: (roomId: string) => api<{ data: Bed[] }>(`/rooms/${roomId}/beds`),
  createBed: (roomId: string, data: object) => api<{ data: Bed }>(`/rooms/${roomId}/beds`, { method: "POST", body: JSON.stringify(data) }),
  updateBed: (id: string, data: object) => api<{ data: Bed }>(`/beds/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  archiveBed: (id: string) => api(`/beds/${id}/archive`, { method: "POST", body: "{}" }),
  tenants: (query = "", page = 1) => api<Page<Tenant>>(`/tenants?${new URLSearchParams({ search: query, page: String(page), pageSize: "20" })}`),
  createTenant: (data: object) => api<{ data: Tenant }>("/tenants", { method: "POST", body: JSON.stringify(data) }),
  occupancies: (all = false) => api<{ data: Occupancy[] }>(`/occupancies${all ? "?status=all" : ""}`),
  createOccupancy: (data: object) => api<{ data: Occupancy }>("/occupancies", { method: "POST", body: JSON.stringify(data) }),
  checkout: (id: string) => api(`/occupancies/${id}/checkout`, { method: "POST", body: "{}" }),
};

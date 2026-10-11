import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BedDouble, Building2, Check,
  ChevronDown, CircleHelp, DoorOpen, Ellipsis, House, KeyRound, LogOut, Menu, Pencil, Plus, Search,
  Settings, ShieldCheck, SlidersHorizontal, UserRound, Users, X,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  createContext, useContext, useEffect, useState,
} from "react";
import {
  Link, NavLink, Navigate, Outlet, Route, Routes as RouterRoutes, useNavigate, useOutletContext, useParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  routes, setCsrfToken, type Bed, type Property, type Room, type Session,
} from "./api";
import {
  BedForm, formatINR, OccupancyForm, PropertyForm, RoomForm, TenantForm,
} from "./forms";

type ShellContext = {
  session: Session;
  notify: (message: string, tone?: "success" | "error") => void;
};

const NoticeContext = createContext<ShellContext["notify"]>(() => undefined);
const useNotice = () => useContext(NoticeContext);
const queryKeys = {
  me: ["me"] as const,
  summary: ["dashboard", "summary"] as const,
  chart: ["dashboard", "occupancy"] as const,
  activity: ["dashboard", "activity"] as const,
  properties: ["properties"] as const,
  property: (id: string) => ["property", id] as const,
  tenants: ["tenants"] as const,
  occupancies: ["occupancies"] as const,
};

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="empty-state error-state"><span className="empty-mark">!</span><h3>We couldn’t load this yet</h3><p>{message}</p>{onRetry && <button className="button secondary" onClick={onRetry}>Try again</button>}</div>;
}

function LoadingCards() {
  return <div className="metric-grid">{[0, 1, 2, 3].map((item) => <div className="metric-card skeleton-card" key={item}><span /><strong /><small /></div>)}</div>;
}

function PageHeader({ eyebrow, title, subtitle, action }: {
  eyebrow: string; title: string; subtitle: string; action?: React.ReactNode;
}) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function AuthScreen({ onAuthenticated, initialRegisterMode = false }: { onAuthenticated: (session: Session) => void; initialRegisterMode?: boolean }) {
  const [registerMode, setRegisterMode] = useState(initialRegisterMode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({ fullName: "", organizationName: "", email: "", password: "" });
  const update = (name: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [name]: value }));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = registerMode
        ? await routes.register({ ...fields, email: fields.email.trim().toLowerCase() })
        : await routes.login({ email: fields.email.trim().toLowerCase(), password: fields.password });
      onAuthenticated(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <div className="auth-art" aria-hidden="true"><div className="auth-art-orbit orbit-a" /><div className="auth-art-orbit orbit-b" /><div className="auth-art-logo"><Building2 size={32} /></div><span className="auth-art-caption">A calmer way to manage your PG.</span></div>
      <section className="auth-panel">
        <Link className="brand auth-brand" to="/"><span className="brand-mark"><Building2 size={19} /></span><span>pg<span>planner</span></span></Link>
        <div className="auth-copy"><span className="eyebrow">{registerMode ? "GET STARTED" : "WELCOME BACK"}</span><h1>{registerMode ? "Build a better-run PG." : "Good to see you."}</h1><p>{registerMode ? "Create your owner account and workspace to get started." : "Sign in to your property management workspace."}</p></div>
        <form className="auth-form" onSubmit={submit}>
          {registerMode && <>
            <label className="form-field"><span>Your name</span><input autoComplete="name" required minLength={2} value={fields.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="Full name" /></label>
            <label className="form-field"><span>Organization name</span><input required minLength={2} value={fields.organizationName} onChange={(event) => update("organizationName", event.target.value)} placeholder="e.g. Maple Living" /></label>
          </>}
          <label className="form-field"><span>Email address</span><input type="email" autoComplete="email" required value={fields.email} onChange={(event) => update("email", event.target.value)} placeholder="you@example.com" /></label>
          <label className="form-field"><span>Password</span><input type="password" autoComplete={registerMode ? "new-password" : "current-password"} required minLength={registerMode ? 10 : 1} value={fields.password} onChange={(event) => update("password", event.target.value)} placeholder={registerMode ? "At least 10 characters" : "Your password"} /><span className="field-hint">Passwords are securely hashed and never stored in plain text.</span></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button primary auth-submit" disabled={busy}>{busy ? "Please wait…" : registerMode ? "Create owner account" : "Sign in"}<ArrowRight size={16} /></button>
        </form>
        <p className="auth-switch">{registerMode ? "Already have a workspace?" : "New to Pg Planner?"}<button onClick={() => { setRegisterMode(!registerMode); setError(""); }}>{registerMode ? " Sign in" : " Create an account"}</button></p>
        <div className="auth-security"><ShieldCheck size={15} /><span>Your data stays private to your organization.</span></div>
      </section>
    </main>
  );
}

function Sidebar({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = [
    { to: "/", label: "Dashboard", icon: House, end: true },
    { to: "/properties", label: "Properties", icon: Building2 },
    { to: "/inventory", label: "Rooms & Beds", icon: BedDouble },
    { to: "/tenants", label: "Tenants", icon: Users },
    { to: "/occupancy", label: "Occupancy", icon: DoorOpen },
    { to: "/settings", label: "Settings", icon: Settings },
  ];
  return <>
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`} aria-label="Main navigation">
      <Link className="brand" to="/" onClick={() => setMobileOpen(false)}><span className="brand-mark"><Building2 size={19} /></span><span>pg<span>planner</span></span></Link>
      <div className="org-picker"><span className="org-avatar">{session.organization.name.slice(0, 1).toUpperCase()}</span><span className="org-name"><small>WORKSPACE</small><strong>{session.organization.name}</strong></span><ChevronDown size={14} /></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="side-nav">{navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}><Icon size={17} strokeWidth={1.7} /><span>{label}</span></NavLink>)}</nav>
      <div className="nav-caption modules-caption">MORE MODULES</div>
      <div className="future-modules"><span><Activity size={15} /> Billing</span><span><CircleHelp size={15} /> Reports</span></div>
      <div className="sidebar-footer">
        <div className="sidebar-tip"><span className="tip-mark">✦</span><span className="eyebrow">A LITTLE REMINDER</span><p>Better operations make more room for better living.</p></div>
        <button className="profile-button" onClick={onLogout}><span className="avatar">{session.user.fullName.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase()}</span><span className="profile-text"><strong>{session.user.fullName}</strong><small>{session.user.email}</small></span><LogOut size={15} /><span className="sr-only">Sign out</span></button>
      </div>
    </aside>
    <button className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
  </>;
}

function AppShell({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" }>();
  const notify = (message: string, tone: "success" | "error" = "success") => {
    setNotice({ message, tone });
    window.setTimeout(() => setNotice(undefined), 3200);
  };
  const logout = useMutation({
    mutationFn: routes.logout,
    onSuccess: () => { setCsrfToken(undefined); queryClient.clear(); },
    onError: (error) => notify(error.message, "error"),
  });
  return <NoticeContext.Provider value={notify}>
    <div className="app-shell">
      <Sidebar session={session} onLogout={() => logout.mutate()} />
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>{session.organization.name}</strong></div><div className="topbar-right"><div className="topbar-date"><span className="live-dot" />{new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(new Date())}</div><button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button><span className="topbar-avatar">{session.user.fullName.slice(0, 1).toUpperCase()}</span></div></header>
        <div className="page-container"><Outlet context={{ session, notify } satisfies ShellContext} /></div>
      </main>
      {notice && <div role="status" className={`toast ${notice.tone}`}><span className="toast-icon">{notice.tone === "success" ? <Check size={15} /> : <X size={15} />}</span>{notice.message}</div>}
    </div>
  </NoticeContext.Provider>;
}

function useShell() {
  return useOutletContext<ShellContext>();
}

function DashboardPage() {
  const { session } = useShell();
  const summary = useQuery({ queryKey: queryKeys.summary, queryFn: async () => (await routes.summary()).data });
  const chart = useQuery({ queryKey: queryKeys.chart, queryFn: async () => (await routes.occupancyChart()).data });
  const activity = useQuery({ queryKey: queryKeys.activity, queryFn: async () => (await routes.activity()).data });
  const navigate = useNavigate();
  const data = summary.data;
  const totalBeds = data?.totalBeds || 0;
  return <div className="page-stack">
    <PageHeader eyebrow={new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase()} title={`Welcome, ${session.user.fullName.split(" ")[0]}`} subtitle="Here’s the latest across your properties." action={<button className="button primary" onClick={() => navigate("/properties?new=1")}><Plus size={16} /> Add property</button>} />
    {summary.isLoading ? <LoadingCards /> : summary.isError ? <ErrorState message={summary.error.message} onRetry={() => void summary.refetch()} /> : <div className="metric-grid">
      <MetricCard label="Active properties" value={data!.totalProperties} helper="Across your portfolio" icon={<Building2 />} tone="violet" onClick={() => navigate("/properties")} />
      <MetricCard label="Rooms" value={data!.totalRooms} helper={`${data!.totalBeds} beds in total`} icon={<DoorOpen />} tone="blue" onClick={() => navigate("/inventory")} />
      <MetricCard label="Occupied beds" value={data!.occupiedBeds} helper={`${data!.vacantBeds} available`} icon={<BedDouble />} tone="green" trend={`${data!.occupancyPercentage}%`} onClick={() => navigate("/occupancy")} />
      <MetricCard label="Active tenants" value={data!.activeTenants} helper={`Expected ${formatINR(data!.expectedMonthlyRent)} / month`} icon={<Users />} tone="amber" onClick={() => navigate("/tenants")} />
    </div>}
    <div className="dashboard-grid">
      <section className="surface occupancy-panel"><div className="section-heading"><div><span className="eyebrow">PORTFOLIO OVERVIEW</span><h2>Occupancy at a glance</h2></div><button className="button ghost compact" onClick={() => navigate("/inventory")}>View inventory <ArrowRight size={14} /></button></div>
        {chart.isLoading ? <div className="chart-skeleton" /> : chart.isError ? <ErrorState message={chart.error.message} onRetry={() => void chart.refetch()} /> : totalBeds === 0 ? <EmptyState title="Your portfolio starts here" description="Add a property, rooms and beds to see live occupancy insights." action={<button className="button primary" onClick={() => navigate("/properties?new=1")}><Plus size={15} /> Add first property</button>} /> : <div className="occupancy-content">
          <div className="donut-wrap"><div className="donut-chart" role="img" aria-label={`${data?.occupancyPercentage || 0}% bed occupancy`}>
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chart.data!.bedStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="78%" outerRadius="92%" startAngle={90} endAngle={-270} paddingAngle={chart.data!.bedStatus.every((slice) => slice.value === 0) ? 0 : 2} stroke="none">{chart.data!.bedStatus.map((slice) => <Cell key={slice.name} fill={slice.name === "Occupied" ? "#9382f5" : "#26314a"} />)}</Pie><Tooltip formatter={(value) => [value, "Beds"]} contentStyle={{ background: "#151c30", border: "1px solid #ffffff18", borderRadius: 8, color: "#e8ecf7", fontSize: 10 }} /></PieChart></ResponsiveContainer>
            <div className="donut-center"><strong>{data?.occupancyPercentage || 0}<small>%</small></strong><span>OCCUPIED</span></div></div></div>
          <div className="occupancy-legend"><div className="legend-total"><strong>{totalBeds}</strong><span>Total beds</span></div><LegendRow color="violet" label="Occupied" value={data?.occupiedBeds || 0} total={totalBeds} /><LegendRow color="slate" label="Available" value={data?.vacantBeds || 0} total={totalBeds} /><p className="chart-footnote">Live counts from your active property inventory.</p></div>
          <div className="property-bars"><h3>By property</h3>{chart.data!.byProperty.map((property) => <div className="property-bar" key={property.id}><div><span>{property.name}</span><small>{property.occupiedBeds} / {property.totalBeds} occupied</small></div><div className="bar-track"><span style={{ width: `${property.totalBeds ? (property.occupiedBeds / property.totalBeds) * 100 : 0}%` }} /></div></div>)}</div>
        </div>}
      </section>
      <section className="surface activity-panel"><div className="section-heading"><div><span className="eyebrow">WHAT’S HAPPENING</span><h2>Recent activity</h2></div><button className="icon-button" aria-label="Activity options"><Ellipsis size={18} /></button></div>
        {activity.isLoading ? <div className="activity-skeleton">{[0, 1, 2, 3].map((item) => <div key={item} />)}</div> : activity.isError ? <ErrorState message={activity.error.message} onRetry={() => void activity.refetch()} /> : activity.data!.length === 0 ? <EmptyState title="No activity yet" description="Tenant check-ins and check-outs will show up here." /> : <div className="activity-list">{activity.data!.map((item) => <div className="activity-item" key={item.id}><span className={`activity-icon ${item.action === "Check-in" ? "checkin" : "checkout"}`}>{item.action === "Check-in" ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}</span><div><strong>{item.tenant}</strong><span>{item.action} · {item.property}, room {item.room}</span></div><time>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(item.date))}</time></div>)}</div>}
      </section>
    </div>
    <section className="quick-actions"><div><span className="eyebrow">GET THINGS MOVING</span><h2>Quick actions</h2></div><div className="quick-action-list">
      <QuickAction icon={<Building2 />} label="Add a property" onClick={() => navigate("/properties?new=1")} />
      <QuickAction icon={<DoorOpen />} label="Add a room" onClick={() => navigate("/inventory?newRoom=1")} />
      <QuickAction icon={<BedDouble />} label="Add a bed" onClick={() => navigate("/inventory?newBed=1")} />
      <QuickAction icon={<Users />} label="Add a tenant" onClick={() => navigate("/tenants?new=1")} />
    </div></section>
  </div>;
}

function MetricCard({ label, value, helper, icon, tone, trend, onClick }: {
  label: string; value: number; helper: string; icon: React.ReactNode; tone: string; trend?: string; onClick?: () => void;
}) {
  return <button className="metric-card" onClick={onClick}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-value">{value.toLocaleString("en-IN")}{trend && <span className="metric-trend">{trend}</span>}</div><div className="metric-helper">{helper}</div></button>;
}
function LegendRow({ color, label, value, total }: { color: string; label: string; value: number; total: number }) {
  return <div className="legend-row"><span className={`legend-dot ${color}`} /><span>{label}</span><strong>{value}</strong><small>{total ? Math.round(value / total * 100) : 0}%</small></div>;
}
function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span className="quick-action-icon">{icon}</span><span>{label}</span><ArrowRight size={14} /></button>;
}
function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-mark">✦</span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
function SearchBox({ value, onChange, placeholder = "Search properties, city…" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="search-box"><Search size={15} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />{value && <button type="button" aria-label="Clear search" onClick={() => onChange("")}><X size={13} /></button>}</label>;
}
function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll("_", " ");
  return <span className={`status-badge ${normalized.replace(" ", "-")}`}><i />{normalized}</span>;
}
function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount < 2) return null;
  return <div className="pagination"><span>Page {page} of {pageCount}</span><div><button disabled={page <= 1} aria-label="Previous page" onClick={() => onPage(page - 1)}><ArrowLeft size={14} /></button><button disabled={page >= pageCount} aria-label="Next page" onClick={() => onPage(page + 1)}><ArrowRight size={14} /></button></div></div>;
}

function PropertiesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notify = useNotice();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const properties = useQuery({ queryKey: [...queryKeys.properties, search, page, status], queryFn: () => routes.properties(search, page, status) });
  const create = useMutation({
    mutationFn: routes.createProperty,
    onSuccess: async () => { setShowForm(false); await queryClient.invalidateQueries({ queryKey: queryKeys.properties }); await queryClient.invalidateQueries({ queryKey: queryKeys.summary }); notify("Property created."); },
    onError: (error) => notify(error.message, "error"),
  });
  const archive = useMutation({
    mutationFn: routes.archiveProperty,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.properties }); await queryClient.invalidateQueries({ queryKey: queryKeys.summary }); notify("Property archived. Its history has been preserved."); },
    onError: (error) => notify(error.message, "error"),
  });
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") setShowForm(true);
  }, []);
  return <div className="page-stack">
    <PageHeader eyebrow="YOUR PORTFOLIO" title="Properties" subtitle="Keep your properties, rooms and occupancy in one view." action={<button className="button primary" onClick={() => setShowForm(true)}><Plus size={16} /> Add property</button>} />
    <section className="surface table-surface">
      <div className="table-toolbar"><div className="toolbar-left"><SearchBox value={search} onChange={(value) => { setSearch(value); setPage(1); }} /><div className="segmented-control"><button className={status === "ACTIVE" ? "selected" : ""} onClick={() => { setStatus("ACTIVE"); setPage(1); }}>Active</button><button className={status === "ARCHIVED" ? "selected" : ""} onClick={() => { setStatus("ARCHIVED"); setPage(1); }}>Archived</button></div></div><button className="button ghost compact"><SlidersHorizontal size={14} /> Filters</button></div>
      {properties.isLoading ? <TableSkeleton /> : properties.isError ? <ErrorState message={properties.error.message} onRetry={() => void properties.refetch()} /> : properties.data!.data.length === 0 ? <EmptyState title={status === "ACTIVE" ? "Your first property is one step away" : "No archived properties"} description={status === "ACTIVE" ? "Add a PG, hostel or co-living property to start managing its rooms and beds." : "Archived properties will stay here with their history preserved."} action={status === "ACTIVE" ? <button className="button primary" onClick={() => setShowForm(true)}><Plus size={15} /> Add your first property</button> : undefined} /> : <>
        <div className="table-scroll"><table><thead><tr><th>PROPERTY</th><th>TYPE</th><th>LOCATION</th><th>ROOMS / BEDS</th><th>OCCUPANCY</th><th>STATUS</th><th /></tr></thead><tbody>{properties.data!.data.map((property) => <tr key={property.id} className="clickable-row" onClick={() => navigate(`/properties/${property.id}`)}><td><span className="property-cell"><span className="property-icon"><Building2 size={17} /></span><span><strong>{property.name}</strong><small>{property.code}</small></span></span></td><td>{property.type.replace("_", " ")}</td><td>{property.locality}, {property.city}</td><td>{property.roomCount || 0} rooms · {property.bedCount || 0} beds</td><td><span className="occupancy-cell"><span>{property.occupiedBeds || 0}/{property.bedCount || 0}</span><i><b style={{ width: `${property.bedCount ? (property.occupiedBeds || 0) / property.bedCount * 100 : 0}%` }} /></i></span></td><td><StatusBadge status={property.status} /></td><td><button className="icon-button row-menu" title={status === "ACTIVE" ? "Archive property" : "Open property"} aria-label={`${status === "ACTIVE" ? "Archive" : "View"} ${property.name}`} onClick={(event) => { event.stopPropagation(); if (status === "ACTIVE" && window.confirm(`Archive ${property.name}? It will remain available in archived properties.`)) archive.mutate(property.id); else if (status === "ARCHIVED") navigate(`/properties/${property.id}`); }}><Ellipsis size={17} /></button></td></tr>)}</tbody></table></div>
        <Pagination page={properties.data!.meta.page} pageCount={properties.data!.meta.pageCount} onPage={setPage} />
      </>}
    </section>
    {showForm && <PropertyForm onClose={() => setShowForm(false)} busy={create.isPending} onSubmit={async (data) => { await create.mutateAsync(data); }} />}
  </div>;
}

function PropertyDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const notify = useNotice();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [roomForm, setRoomForm] = useState(false);
  const detail = useQuery({ queryKey: queryKeys.property(id), queryFn: async () => (await routes.property(id)).data, enabled: Boolean(id) });
  const update = useMutation({
    mutationFn: (data: object) => routes.updateProperty(id, data),
    onSuccess: async () => { setEditing(false); await queryClient.invalidateQueries({ queryKey: queryKeys.property(id) }); await queryClient.invalidateQueries({ queryKey: queryKeys.properties }); notify("Property updated."); },
    onError: (error) => notify(error.message, "error"),
  });
  const createRoom = useMutation({
    mutationFn: (data: object) => routes.createRoom(id, data),
    onSuccess: async () => { setRoomForm(false); await queryClient.invalidateQueries({ queryKey: queryKeys.property(id) }); await queryClient.invalidateQueries({ queryKey: queryKeys.summary }); notify("Room added."); },
    onError: (error) => notify(error.message, "error"),
  });
  const property = detail.data;
  if (detail.isLoading) return <div className="page-stack"><div className="chart-skeleton" /></div>;
  if (detail.isError || !property) return <ErrorState message={detail.error?.message || "Property not found."} onRetry={() => void detail.refetch()} />;
  const bedCount = property.rooms.reduce((sum, room) => sum + room.beds.length, 0);
  const occupied = property.rooms.reduce((sum, room) => sum + room.beds.filter((bed) => bed.status === "OCCUPIED").length, 0);
  return <div className="page-stack">
    <button className="back-link" onClick={() => navigate("/properties")}><ArrowLeft size={14} /> All properties</button>
    <PageHeader eyebrow={`${property.code} · ${property.type.replace("_", " ")}`} title={property.name} subtitle={`${property.addressLine1}${property.addressLine2 ? `, ${property.addressLine2}` : ""}, ${property.locality}, ${property.city}, ${property.state} ${property.postalCode}`} action={<><button className="button secondary" onClick={() => setEditing(true)}>Edit property</button><button className="button primary" onClick={() => setRoomForm(true)}><Plus size={16} /> Add room</button></>} />
    <div className="detail-stats"><div><span>Rooms</span><strong>{property.rooms.length}</strong></div><div><span>Total beds</span><strong>{bedCount}</strong></div><div><span>Occupied</span><strong>{occupied}</strong></div><div><span>Available</span><strong>{Math.max(0, bedCount - occupied)}</strong></div></div>
    <section className="surface table-surface"><div className="section-heading"><div><span className="eyebrow">ROOMS & INVENTORY</span><h2>Room layout</h2></div></div>
      {property.rooms.length === 0 ? <EmptyState title="No rooms added yet" description="Add a room, then add individually managed beds." action={<button className="button primary" onClick={() => setRoomForm(true)}><Plus size={15} /> Add a room</button>} /> : <div className="room-list">{property.rooms.map((room) => <RoomCard key={room.id} room={room} property={property} onChanged={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.property(id) }); }} notify={notify} />)}</div>}
    </section>
    {editing && <PropertyForm property={property} onClose={() => setEditing(false)} busy={update.isPending} onSubmit={async (data) => { await update.mutateAsync(data); }} />}
    {roomForm && <RoomForm onClose={() => setRoomForm(false)} busy={createRoom.isPending} onSubmit={async (data) => { await createRoom.mutateAsync(data); }} />}
  </div>;
}

function RoomCard({ room, property, onChanged, notify, bedStatusFilter = "all" }: {
  room: Room & { beds: Bed[] }; property: Property; onChanged: () => void; notify: (message: string, tone?: "success" | "error") => void; bedStatusFilter?: string;
}) {
  const [showBedForm, setShowBedForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingBed, setEditingBed] = useState<Bed>();
  const queryClient = useQueryClient();
  const addBed = useMutation({
    mutationFn: (data: object) => routes.createBed(room.id, data),
    onSuccess: async () => { setShowBedForm(false); onChanged(); await queryClient.invalidateQueries({ queryKey: queryKeys.summary }); notify("Bed added."); },
    onError: (error) => notify(error.message, "error"),
  });
  const updateBed = useMutation({
    mutationFn: ({ bedId, data }: { bedId: string; data: object }) => routes.updateBed(bedId, data),
    onSuccess: async () => { onChanged(); await queryClient.invalidateQueries({ queryKey: queryKeys.summary }); notify("Bed status updated."); },
    onError: (error) => notify(error.message, "error"),
  });
  const archiveRoom = useMutation({
    mutationFn: () => routes.archiveRoom(room.id),
    onSuccess: () => { onChanged(); notify("Room deactivated."); },
    onError: (error) => notify(error.message, "error"),
  });
  const updateRoom = useMutation({
    mutationFn: (data: object) => routes.updateRoom(room.id, data),
    onSuccess: () => { setEditing(false); onChanged(); notify("Room updated."); },
    onError: (error) => notify(error.message, "error"),
  });
  const updateExistingBed = useMutation({
    mutationFn: ({ bedId, data }: { bedId: string; data: object }) => routes.updateBed(bedId, data),
    onSuccess: () => { setEditingBed(undefined); onChanged(); notify("Bed updated."); },
    onError: (error) => notify(error.message, "error"),
  });
  const visibleBeds = bedStatusFilter === "all" ? room.beds : room.beds.filter((bed) => bed.status === bedStatusFilter);
  return <article className="room-card">
    <div className="room-heading"><div className="room-number"><span className="room-icon"><DoorOpen size={17} /></span><span><strong>Room {room.identifier}</strong><small>{room.floor} floor · {room.type.toLowerCase().replace("_", " ")}</small></span></div><div className="room-actions"><span>{room.beds.length} / {room.capacity} beds</span><button className="button ghost compact" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</button><button className="button ghost compact" disabled={room.beds.length >= room.capacity || room.status !== "ACTIVE"} onClick={() => setShowBedForm(true)}><Plus size={14} /> Add bed</button><button className="icon-button" aria-label={`Deactivate room ${room.identifier}`} disabled={room.status !== "ACTIVE"} onClick={() => { if (window.confirm(`Deactivate room ${room.identifier}?`)) archiveRoom.mutate(); }}><Ellipsis size={17} /></button></div></div>
    {room.beds.length === 0 ? <p className="room-empty">No beds in this room yet.</p> : visibleBeds.length === 0 ? <p className="room-empty">No beds match this status.</p> : <div className="bed-grid">{visibleBeds.map((bed) => <BedTile key={bed.id} bed={bed} onEdit={() => setEditingBed(bed)} onStatusChange={(status) => updateBed.mutate({ bedId: bed.id, data: { status } })} />)}</div>}
    {editing && <RoomForm room={room} onClose={() => setEditing(false)} busy={updateRoom.isPending} onSubmit={async (data) => { await updateRoom.mutateAsync(data); }} />}
    {showBedForm && <BedForm onClose={() => setShowBedForm(false)} busy={addBed.isPending} onSubmit={async (data) => { await addBed.mutateAsync(data); }} />}
    {editingBed && <BedForm bed={editingBed} onClose={() => setEditingBed(undefined)} busy={updateExistingBed.isPending} onSubmit={async (data) => { await updateExistingBed.mutateAsync({ bedId: editingBed.id, data }); }} />}
    <span className="sr-only">{property.name}</span>
  </article>;
}

function BedTile({ bed, onEdit, onStatusChange }: {
  bed: Bed; onEdit: () => void; onStatusChange: (status: string) => void;
}) {
  const occupied = bed.status === "OCCUPIED";
  const options: Bed["status"][] = ["AVAILABLE", "MAINTENANCE", "INACTIVE"];
  return <div className={`bed-tile ${bed.status.toLowerCase()}`}><div className="bed-tile-top"><span className="bed-icon"><BedDouble size={15} /></span><StatusBadge status={bed.status} /><button className="bed-action" title="Edit bed" aria-label={`Edit bed ${bed.label}`} onClick={onEdit}><Pencil size={13} /></button><button className="bed-action" title="Update bed status" aria-label={`Update bed ${bed.label} status`} disabled={occupied} onClick={() => {
    const next = options[(options.indexOf(bed.status as typeof options[number]) + 1) % options.length];
    if (next === "INACTIVE" && !window.confirm(`Deactivate bed ${bed.label}?`)) return;
    onStatusChange(next);
  }}><Ellipsis size={15} /></button></div><strong>Bed {bed.label}</strong><span>{formatINR(bed.monthlyRent)} <small>/ mo</small></span>{occupied && <small className="bed-occupied-note">Currently occupied</small>}</div>;
}

function InventoryPage() {
  const queryClient = useQueryClient();
  const notify = useNotice();
  const properties = useQuery({ queryKey: [...queryKeys.properties, "", 1, "ACTIVE"], queryFn: () => routes.properties("", 1) });
  const [propertyId, setPropertyId] = useState(() => new URLSearchParams(window.location.search).get("propertyId") || "");
  const [roomFilter, setRoomFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [bedStatusFilter, setBedStatusFilter] = useState("all");
  const activeId = propertyId || properties.data?.data[0]?.id || "";
  const detail = useQuery({ queryKey: queryKeys.property(activeId), queryFn: async () => (await routes.property(activeId)).data, enabled: Boolean(activeId) });
  const navigate = useNavigate();
  const [roomForm, setRoomForm] = useState(false);
  const [bedFormRoom, setBedFormRoom] = useState<Room>();
  useEffect(() => {
    if (!properties.data?.data.length) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("newRoom") === "1") {
      setRoomForm(true);
      params.delete("newRoom");
    } else if (params.get("newBed") === "1" && detail.data) {
      const requestedRoomId = params.get("roomId");
      const room = detail.data.rooms.find((candidate) =>
        candidate.status === "ACTIVE" && (!requestedRoomId || candidate.id === requestedRoomId),
      );
      if (room) setBedFormRoom(room);
      else notify("That room is no longer available for adding a bed.", "error");
      params.delete("newBed");
      params.delete("roomId");
    }
    if (params.size !== new URLSearchParams(window.location.search).size) {
      const suffix = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}`);
    }
  }, [properties.data, detail.data, notify]);
  const addRoom = useMutation({
    mutationFn: (data: object) => routes.createRoom(activeId, data),
    onSuccess: async () => { setRoomForm(false); await queryClient.invalidateQueries({ queryKey: queryKeys.property(activeId) }); await queryClient.invalidateQueries({ queryKey: queryKeys.summary }); notify("Room added."); },
    onError: (error) => notify(error.message, "error"),
  });
  const addBed = useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: object }) => routes.createBed(roomId, data),
    onSuccess: async () => { setBedFormRoom(undefined); await queryClient.invalidateQueries({ queryKey: queryKeys.property(activeId) }); await queryClient.invalidateQueries({ queryKey: ["available-beds"] }); await queryClient.invalidateQueries({ queryKey: queryKeys.summary }); notify("Bed added."); },
    onError: (error) => notify(error.message, "error"),
  });
  const floors = [...new Set(detail.data?.rooms.map((room) => room.floor) || [])];
  const visibleRooms = detail.data?.rooms.filter((room) => {
    if (roomFilter !== "all" && room.id !== roomFilter) return false;
    if (floorFilter !== "all" && room.floor !== floorFilter) return false;
    if (bedStatusFilter !== "all" && !room.beds.some((bed) => bed.status === bedStatusFilter)) return false;
    return true;
  }) || [];
  return <div className="page-stack">
    <PageHeader eyebrow="PROPERTY INVENTORY" title="Rooms & beds" subtitle="See every room and bed, with availability at a glance." action={activeId && <button className="button primary" onClick={() => setRoomForm(true)}><Plus size={16} /> Add room</button>} />
    {properties.isLoading ? <div className="chart-skeleton" /> : properties.isError ? <ErrorState message={properties.error.message} onRetry={() => void properties.refetch()} /> : !properties.data!.data.length ? <section className="surface"><EmptyState title="No properties to inventory" description="Create your first property before adding rooms and beds." action={<button className="button primary" onClick={() => navigate("/properties?new=1")}><Plus size={15} /> Add property</button>} /></section> : <>
      <div className="inventory-toolbar"><label className="form-field"><span>Property</span><select value={activeId} onChange={(event) => { setPropertyId(event.target.value); setRoomFilter("all"); setFloorFilter("all"); }} aria-label="Filter by property">{properties.data!.data.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.city}</option>)}</select></label>{detail.data && <span className="inventory-caption">{detail.data.rooms.length} rooms · {detail.data.rooms.reduce((sum, room) => sum + room.beds.length, 0)} beds</span>}</div>
      {detail.data && <div className="inventory-filters"><label><span>Room</span><select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} aria-label="Filter by room"><option value="all">All rooms</option>{detail.data.rooms.map((room) => <option value={room.id} key={room.id}>Room {room.identifier}</option>)}</select></label><label><span>Floor</span><select value={floorFilter} onChange={(event) => setFloorFilter(event.target.value)} aria-label="Filter by floor"><option value="all">All floors</option>{floors.map((floor) => <option value={floor} key={floor}>{floor}</option>)}</select></label><label><span>Bed status</span><select value={bedStatusFilter} onChange={(event) => setBedStatusFilter(event.target.value)} aria-label="Filter by bed status"><option value="all">All statuses</option>{["AVAILABLE", "OCCUPIED", "MAINTENANCE", "INACTIVE"].map((status) => <option value={status} key={status}>{status.toLowerCase()}</option>)}</select></label></div>}
      {detail.isLoading ? <div className="chart-skeleton" /> : detail.isError ? <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} /> : <section className="room-list inventory-room-list">{detail.data!.rooms.length === 0 ? <div className="surface"><EmptyState title="No rooms in this property" description="Add rooms first, then use each room card to add beds." action={<button className="button primary" onClick={() => setRoomForm(true)}><Plus size={15} /> Add room</button>} /></div> : visibleRooms.length === 0 ? <div className="surface"><EmptyState title="No matching rooms" description="Try a different room, floor or bed-status filter." /></div> : visibleRooms.map((room) => <RoomCard key={room.id} room={room} property={detail.data!} notify={notify} bedStatusFilter={bedStatusFilter} onChanged={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.property(activeId) }); void queryClient.invalidateQueries({ queryKey: queryKeys.properties }); }} />)}</section>}
    </>}
    {roomForm && activeId && <RoomForm onClose={() => setRoomForm(false)} busy={addRoom.isPending} onSubmit={async (data) => { await addRoom.mutateAsync(data); }} />}
    {bedFormRoom && <BedForm onClose={() => setBedFormRoom(undefined)} busy={addBed.isPending} onSubmit={async (data) => { await addBed.mutateAsync({ roomId: bedFormRoom.id, data }); }} />}
  </div>;
}

function TenantsPage() {
  const queryClient = useQueryClient();
  const notify = useNotice();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const tenants = useQuery({ queryKey: [...queryKeys.tenants, search, page], queryFn: () => routes.tenants(search, page) });
  const create = useMutation({
    mutationFn: routes.createTenant,
    onSuccess: async () => { setShowForm(false); await queryClient.invalidateQueries({ queryKey: queryKeys.tenants }); notify("Tenant added."); },
    onError: (error) => notify(error.message, "error"),
  });
  return <div className="page-stack"><PageHeader eyebrow="PEOPLE" title="Tenants" subtitle="Tenant contact information and current stays." action={<button className="button primary" onClick={() => setShowForm(true)}><Plus size={16} /> Add tenant</button>} />
    <section className="surface table-surface"><div className="table-toolbar"><SearchBox value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search name, email or phone…" /></div>
      {tenants.isLoading ? <TableSkeleton /> : tenants.isError ? <ErrorState message={tenants.error.message} onRetry={() => void tenants.refetch()} /> : tenants.data!.data.length === 0 ? <EmptyState title={search ? "No tenants match that search" : "No tenants yet"} description={search ? "Try a different name, email or phone number." : "Add a tenant to your organization, then assign them to an available bed."} action={!search ? <button className="button primary" onClick={() => setShowForm(true)}><Plus size={15} /> Add tenant</button> : undefined} /> : <>
        <div className="table-scroll"><table><thead><tr><th>TENANT</th><th>PHONE</th><th>EMAIL</th><th>CURRENT STAY</th><th>STATUS</th></tr></thead><tbody>{tenants.data!.data.map((tenant) => { const stay = tenant.occupancies?.[0]; return <tr key={tenant.id}><td><span className="property-cell"><span className="tenant-avatar">{tenant.fullName[0].toUpperCase()}</span><span><strong>{tenant.fullName}</strong><small>Added to workspace</small></span></span></td><td>{tenant.phone}</td><td>{tenant.email || "—"}</td><td>{stay ? `${stay.bed.room.property.name} · ${stay.bed.room.identifier} / ${stay.bed.label}` : "—"}</td><td><StatusBadge status={stay ? "OCCUPIED" : "AVAILABLE"} /></td></tr>; })}</tbody></table></div>
        <Pagination page={tenants.data!.meta.page} pageCount={tenants.data!.meta.pageCount} onPage={setPage} />
      </>}
    </section>
    {showForm && <TenantForm onClose={() => setShowForm(false)} busy={create.isPending} onSubmit={async (data) => { await create.mutateAsync(data); }} />}
  </div>;
}

function OccupancyPage() {
  const queryClient = useQueryClient();
  const notify = useNotice();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const occupancies = useQuery({ queryKey: queryKeys.occupancies, queryFn: async () => (await routes.occupancies()).data });
  const tenants = useQuery({ queryKey: [...queryKeys.tenants, "", 1], queryFn: async () => (await routes.tenants("", 1)).data });
  const properties = useQuery({ queryKey: [...queryKeys.properties, "", 1, "ACTIVE"], queryFn: () => routes.properties("", 1) });
  const roomQueries = useQuery({
    queryKey: ["available-beds", properties.data?.data.map((property) => property.id).join(",")],
    enabled: Boolean(properties.data?.data.length),
    queryFn: async () => {
      const all = await Promise.all(properties.data!.data.map(async (property) => {
        const detail = (await routes.property(property.id)).data;
        return {
          beds: detail.rooms.flatMap((room) => room.beds.map((bed) => ({ ...bed, room: { ...room, property } }))),
          rooms: detail.rooms.map((room) => ({ ...room, property })),
        };
      }));
      return { beds: all.flatMap((property) => property.beds), rooms: all.flatMap((property) => property.rooms) };
    },
  });
  const create = useMutation({
    mutationFn: routes.createOccupancy,
    onSuccess: async () => { setShowForm(false); await queryClient.invalidateQueries({ queryKey: queryKeys.occupancies }); await queryClient.invalidateQueries({ queryKey: queryKeys.summary }); await queryClient.invalidateQueries({ queryKey: queryKeys.chart }); await queryClient.invalidateQueries({ queryKey: queryKeys.activity }); await queryClient.invalidateQueries({ queryKey: ["properties"] }); await queryClient.invalidateQueries({ queryKey: ["property"] }); await queryClient.invalidateQueries({ queryKey: queryKeys.tenants }); notify("Tenant checked in."); },
    onError: (error) => notify(error.message, "error"),
  });
  const checkout = useMutation({
    mutationFn: routes.checkout,
    onSuccess: async () => { await queryClient.invalidateQueries(); notify("Tenant checked out."); },
    onError: (error) => notify(error.message, "error"),
  });
  const busy = occupancies.isLoading || tenants.isLoading || properties.isLoading || roomQueries.isLoading;
  const failed = occupancies.isError || tenants.isError || properties.isError || roomQueries.isError;
  const error = occupancies.error || tenants.error || properties.error || roomQueries.error;
  return <div className="page-stack"><PageHeader eyebrow="STAYS & CHECK-INS" title="Occupancy" subtitle="Manage current stays and check-in or check-out tenants." action={<button className="button primary" onClick={() => setShowForm(true)}><Plus size={16} /> Check in tenant</button>} />
    <section className="surface table-surface">
      {busy ? <TableSkeleton /> : failed ? <ErrorState message={error?.message || "Could not load occupancy."} onRetry={() => { void occupancies.refetch(); void tenants.refetch(); void properties.refetch(); void roomQueries.refetch(); }} /> : occupancies.data!.length === 0 ? <EmptyState title="No active stays" description="Add a tenant and an available bed, then create the first check-in." action={<button className="button primary" onClick={() => setShowForm(true)}><Plus size={15} /> Check in tenant</button>} /> : <div className="table-scroll"><table><thead><tr><th>TENANT</th><th>PROPERTY & BED</th><th>CHECK-IN</th><th>PLANNED CHECK-OUT</th><th>MONTHLY RENT</th><th /></tr></thead><tbody>{occupancies.data!.map((stay) => <tr key={stay.id}><td><span className="property-cell"><span className="tenant-avatar">{stay.tenant.fullName[0].toUpperCase()}</span><span><strong>{stay.tenant.fullName}</strong><small>{stay.tenant.phone}</small></span></span></td><td>{stay.bed.room.property.name}<small className="table-subline">Room {stay.bed.room.identifier} · Bed {stay.bed.label}</small></td><td>{dateLabel(stay.checkIn)}</td><td>{stay.plannedCheckOut ? dateLabel(stay.plannedCheckOut) : "Not set"}</td><td>{formatINR(stay.agreedMonthlyRent)}</td><td><button className="button secondary compact" onClick={() => { if (window.confirm(`Check out ${stay.tenant.fullName}?`)) checkout.mutate(stay.id); }} disabled={checkout.isPending}>Check out</button></td></tr>)}</tbody></table></div>}
    </section>
    {showForm && <OccupancyForm tenants={tenants.data || []} beds={roomQueries.data?.beds || []} rooms={roomQueries.data?.rooms || []} onClose={() => setShowForm(false)} onAddBed={(propertyId, roomId) => navigate(`/inventory?propertyId=${encodeURIComponent(propertyId)}&roomId=${encodeURIComponent(roomId)}&newBed=1`)} busy={create.isPending} onSubmit={async (data) => { await create.mutateAsync(data); }} />}
  </div>;
}

function SettingsPage() {
  const { session } = useShell();
  return <div className="page-stack"><PageHeader eyebrow="WORKSPACE" title="Settings" subtitle="Your account and organization workspace." />
    <section className="surface settings-card"><span className="settings-icon"><UserRound size={20} /></span><div><span className="eyebrow">YOUR ACCOUNT</span><h2>{session.user.fullName}</h2><p>{session.user.email}</p></div><StatusBadge status={session.role || "OWNER"} /></section>
    <section className="surface settings-card"><span className="settings-icon purple"><Building2 size={20} /></span><div><span className="eyebrow">ORGANIZATION</span><h2>{session.organization.name}</h2><p>All properties, rooms, beds, tenants and activity belong to this private workspace.</p></div><StatusBadge status={session.role || "OWNER"} /></section>
    <section className="surface settings-note"><KeyRound size={17} /><div><strong>Secure by design</strong><p>Sign-in uses server-side sessions, password hashing and organization-scoped access controls. Session-changing requests use a CSRF token.</p></div></section>
  </div>;
}

function TableSkeleton() {
  return <div className="table-skeleton"><div className="skeleton-row heading" />{[0, 1, 2, 3, 4].map((row) => <div className="skeleton-row" key={row}><i /><i /><i /><i /></div>)}</div>;
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export default function App() {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => (await routes.me()).data,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => setCsrfToken(sessionQuery.data?.csrfToken), [sessionQuery.data?.csrfToken]);
  if (sessionQuery.isLoading) return <div className="loading-screen"><span className="loader-mark"><Building2 size={24} /></span><span>Opening your workspace…</span></div>;
  const hasSession = Boolean(sessionQuery.data);
  return <RouterRoutes>
    <Route path="/login" element={hasSession ? <Navigate to="/" replace /> : <AuthScreen onAuthenticated={(session) => { setCsrfToken(session.csrfToken); queryClient.setQueryData(queryKeys.me, session); }} />} />
    <Route path="/register" element={hasSession ? <Navigate to="/" replace /> : <AuthScreen initialRegisterMode onAuthenticated={(session) => { setCsrfToken(session.csrfToken); queryClient.setQueryData(queryKeys.me, session); }} />} />
    <Route element={hasSession ? <AppShell session={sessionQuery.data!} /> : <Navigate to="/login" replace />}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/properties" element={<PropertiesPage />} />
      <Route path="/properties/:id" element={<PropertyDetailPage />} />
      <Route path="/inventory" element={<InventoryPage />} />
      <Route path="/tenants" element={<TenantsPage />} />
      <Route path="/occupancy" element={<OccupancyPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </RouterRoutes>;
}

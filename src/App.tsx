import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  Compass,
  Database,
  Download,
  Globe2,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  MoonStar,
  Plus,
  Printer,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { api } from "./api";
import ChartWheel from "./ChartWheel";
import SynastryView from "./SynastryView";
import AstroMapView from "./AstroMapView";
import { LanguageSwitch, useI18n } from "./i18n";
import type { Chart, LocationResult, Planet, Profile, TransitReportEvent, User } from "./types";

type View =
  "dashboard" | "profiles" | "chart" | "ephemeris" | "forecast" | "synastry" | "astromap" | "admin";
const blank: Omit<Profile, "id"> = {
  name: "",
  birthDate: "1990-01-01",
  birthTime: "12:00",
  place: "",
  latitude: 0,
  longitude: 0,
  timezone: 0,
  timezoneId: null,
  houseSystem: "PLACIDUS",
  zodiac: "TROPICAL",
  notes: "",
  isPrimary: false,
};
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <div className="toast">
      {message}
      <button onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}

function Auth({ onAuth }: { onAuth: (u: User) => void }) {
  const {t}=useI18n();
  const [register, setRegister] = useState(false),
    [registrationEnabled, setRegistrationEnabled] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  useEffect(() => { api<{registrationEnabled:boolean}>("/auth/config").then(r => setRegistrationEnabled(r.registrationEnabled)).catch(() => undefined); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await api<{ user: User }>(
        `/auth/${register ? "register" : "login"}`,
        { method: "POST", body: JSON.stringify(form) },
      );
      onAuth(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <div className="stars" />
        <img className="brand-icon large" src="/brand/asterivum-icon.png" alt="" />
        <p className="eyebrow">{t("The astrologer's studio")}</p>
        <h1>
          {t("Map the sky.")}
          <br />
          <em>{t("Read the moment.")}</em>
        </h1>
        <p>{t("A considered workspace for natal practice, forecasting, and client archives.")}</p>
        <div className="auth-quote">
          “{t("The chart is a map of potential—not a sentence.")}”
        </div>
      </section>
      <section className="auth-panel">
        <LanguageSwitch compact />
        <form className="auth-card" onSubmit={submit}>
          <div className="mobile-brand">
            <img className="brand-icon" src="/brand/asterivum-icon.png" alt="" /> Asterivum
          </div>
          <p className="eyebrow">
            {t(register ? "Begin your practice" : "Welcome back")}
          </p>
          <h2>{t(register ? "Create your account" : "Enter the studio")}</h2>
          <p className="muted">
            {register
              ? t("Save charts and build a private client library.")
              : t("Your charts, ephemerides, and readings await.")}
          </p>
          {register && (
            <label>
              {t("Full name")}
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("Your name")}
                required
              />
            </label>
          )}
          <label>
            {t("Email address")}
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            {t("Password")}
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t("12 characters minimum")}
              minLength={12}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary wide" disabled={loading}>
            {loading ? t("Opening…") : t(register ? "Create account" : "Sign in")}
            <ChevronRight size={17} />
          </button>
          {(registrationEnabled || register) && <button type="button" className="text-btn" onClick={() => setRegister(!register)}>
            {t(register ? "Already have an account? Sign in" : "New to Asterivum? Create an account")}
          </button>}
          <small>{t("By continuing you agree to keep client birth data secure and use interpretations responsibly.")}</small>
        </form>
      </section>
    </main>
  );
}

function ProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile?: Profile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const {t}=useI18n();
  const [form, setForm] = useState(profile || blank),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [locationConfirmed, setLocationConfirmed] = useState(Boolean(profile)),
    [locationResults, setLocationResults] = useState<LocationResult[]>([]),
    [locationLoading, setLocationLoading] = useState(false),
    [locationOpen, setLocationOpen] = useState(false),
    [selectedTimezone, setSelectedTimezone] = useState<string | null>(
      profile?.timezoneId || null,
    );
  const field = (k: keyof typeof form, v: unknown) =>
    setForm({ ...form, [k]: v });
  const birthMomentField = (key: "birthDate" | "birthTime", value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationConfirmed) {
      setError(t("Select a birth place from the search results."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/profiles${profile ? `/${profile.id}` : ""}`, {
        method: profile ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          timezone: Number(form.timezone),
          isPrimary: Boolean(form.isPrimary),
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!locationOpen || locationConfirmed || form.place.trim().length < 3) {
      setLocationResults([]);
      setLocationLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLocationLoading(true);
      api<{ results: LocationResult[] }>(
        `/locations/search?q=${encodeURIComponent(form.place.trim())}`,
        { signal: controller.signal },
      )
        .then((r) => setLocationResults(r.results))
        .catch((e) => {
          if ((e as Error).name !== "AbortError")
            setError((e as Error).message);
        })
        .finally(() => setLocationLoading(false));
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.place, locationConfirmed, locationOpen]);

  useEffect(() => {
    if (!selectedTimezone) return;
    const controller = new AbortController();
    api<{ offset:number }>("/locations/offset", {
      method:"POST",
      signal:controller.signal,
      body:JSON.stringify({
        date:form.birthDate,
        time:form.birthTime,
        timezoneId:selectedTimezone,
      }),
    })
      .then(({ offset }) => setForm((current) => ({
        ...current,
        timezone:offset,
        timezoneId:selectedTimezone,
      })))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      });
    return () => controller.abort();
  }, [form.birthDate, form.birthTime, selectedTimezone]);

  const chooseLocation = (location: LocationResult) => {
    setForm({
      ...form,
      place: location.label,
      latitude: location.latitude,
      longitude: location.longitude,
      timezoneId: location.timezone,
    });
    setSelectedTimezone(location.timezone);
    setLocationConfirmed(true);
    setLocationOpen(false);
    setLocationResults([]);
    setError("");
  };
  return (
    <div
      className="modal-bg"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form className="modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">{t("Birth data")}</p>
            <h2>{t(profile ? "Edit profile" : "New client chart")}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="form-grid">
          <label className="span-2">
            {t("Client or chart name")}
            <input
              value={form.name}
              onChange={(e) => field("name", e.target.value)}
              required
            />
          </label>
          <label>
            {t("Date of birth")}
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => birthMomentField("birthDate", e.target.value)}
              required
            />
          </label>
          <label>
            {t("Local birth time")}
            <input
              type="time"
              value={form.birthTime}
              onChange={(e) => birthMomentField("birthTime", e.target.value)}
              required
            />
          </label>
          <label className="span-2 location-field">
            {t("Birth place")}
            <input
              value={form.place}
              onFocus={() => setLocationOpen(true)}
              onChange={(e) => {
                field("place", e.target.value);
                setLocationConfirmed(false);
                setLocationOpen(true);
              }}
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={
                locationOpen &&
                (locationLoading || locationResults.length > 0)
              }
              placeholder={t("Start typing a city or postal code")}
              required
            />
            {locationOpen &&
              !locationConfirmed &&
              form.place.trim().length >= 3 && (
                <div className="location-results" role="listbox">
                  {locationLoading ? (
                    <div className="location-status">{t("Searching places…")}</div>
                  ) : locationResults.length ? (
                    locationResults.map((location) => (
                      <button
                        type="button"
                        role="option"
                        key={location.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => chooseLocation(location)}
                      >
                        <strong>{location.name}</strong>
                        <span>{location.label}</span>
                      </button>
                    ))
                  ) : (
                    <div className="location-status">{t("No matching places")}</div>
                  )}
                </div>
              )}
          </label>
          <label>
            {t("Latitude")}
            <input
              value={
                locationConfirmed ? Number(form.latitude).toFixed(5) : ""
              }
              placeholder={t("Filled from place")}
              readOnly
              aria-readonly="true"
            />
          </label>
          <label>
            {t("Longitude")}
            <input
              value={
                locationConfirmed ? Number(form.longitude).toFixed(5) : ""
              }
              placeholder={t("Filled from place")}
              readOnly
              aria-readonly="true"
            />
          </label>
          <label>
            {t("UTC offset at birth")}
            <input
              type="number"
              step="0.25"
              min="-14"
              max="14"
              value={form.timezone}
              onChange={(e) => {
                setSelectedTimezone(null);
                setForm({ ...form, timezone:Number(e.target.value), timezoneId:null });
              }}
            />
            {selectedTimezone && (
              <small
                className="field-note"
                data-detected-offset={form.timezone}
              >
                {t("Detected from")} {selectedTimezone}
              </small>
            )}
          </label>
          <label>
            {t("House system")}
            <select
              value={form.houseSystem}
              onChange={(e) => field("houseSystem", e.target.value)}
            >
              <option value="PLACIDUS">Placidus</option>
              <option value="WHOLE_SIGN">{t("Whole Sign")}</option>
              <option value="EQUAL">{t("Equal House")}</option>
            </select>
          </label>
          <label>
            {t("Zodiac")}
            <select
              value={form.zodiac}
              onChange={(e) => field("zodiac", e.target.value)}
            >
              <option value="TROPICAL">{t("Tropical")}</option>
              <option value="SIDEREAL">{t("Sidereal (Lahiri approx.)")}</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(form.isPrimary)}
              onChange={(e) => field("isPrimary", e.target.checked)}
            />{" "}
            {t("Primary profile")}
          </label>
          <label className="span-2">
            {t("Private notes")}
            <textarea
              value={form.notes}
              onChange={(e) => field("notes", e.target.value)}
              rows={3}
            />
          </label>
        </div>
        <p className="hint">
          {t("Placidus uses exact semi-arc cusps. At polar latitudes, where Placidus is undefined, the chart uses an equal-house fallback.")}
        </p>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="primary" disabled={saving}>
            <Save size={16} />
            {t(saving ? "Saving…" : "Save profile")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Dashboard({
  profiles,
  onView,
  onNew,
}: {
  profiles: Profile[];
  onView: (v: View, id?: number) => void;
  onNew: () => void;
}) {
  const {t,locale}=useI18n();
  const primary = profiles.find((p) => p.isPrimary) || profiles[0];
  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">{t("Celestial overview")}</p>
          <h1>{t("Your practice, at a glance")}</h1>
          <p className="muted">
            {new Date().toLocaleDateString(locale, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <button className="primary" onClick={onNew}>
          <Plus size={17} />
          {t("New chart")}
        </button>
      </header>
      <section className="hero-card">
        <div>
          <span className="pill">
            <Sparkles size={13} />
            {t("Current sky")}
          </span>
          <h2>
            {t("Keep the symbol")}
            <br />
            <em>{t("close to the sky.")}</em>
          </h2>
          <p>{t("Open today’s transits against your primary chart, or begin with a new client profile.")}</p>
          <button
            onClick={() => primary && onView("chart", primary.id)}
            disabled={!primary}
          >
            {t("View transits")} <ChevronRight size={16} />
          </button>
        </div>
        <div className="orbit-art">
          <div className="orbit one">
            <i />
          </div>
          <div className="orbit two">
            <i />
          </div>
          <MoonStar size={54} />
        </div>
      </section>
      <div className="stat-row">
        <div className="stat">
          <Users />
          <span>{profiles.length}</span>
          <p>{t("Client profiles")}</p>
        </div>
        <div className="stat">
          <Compass />
          <span>3</span>
          <p>{t("Chart methods")}</p>
        </div>
        <div className="stat">
          <CalendarDays />
          <span>{t("3 yrs")}</span>
          <p>{t("Forecast range")}</p>
        </div>
      </div>
      <section>
        <div className="section-title">
          <div>
            <p className="eyebrow">{t("Recent charts")}</p>
            <h2>{t("Client profiles")}</h2>
          </div>
          <button className="text-btn" onClick={() => onView("profiles")}>
            {t("View all")} <ChevronRight size={15} />
          </button>
        </div>
        {profiles.length ? (
          <div className="profile-grid">
            {profiles.slice(0, 4).map((p) => (
              <button
                className="profile-card"
                key={p.id}
                onClick={() => onView("chart", p.id)}
              >
                <div className="avatar">{p.name.charAt(0)}</div>
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    {p.birthDate} · {p.place}
                  </span>
                  <small>
                    {p.zodiac.toLowerCase()} ·{" "}
                    {p.houseSystem.replace("_", " ").toLowerCase()}
                  </small>
                </div>
                <ChevronRight />
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">
            <MoonStar />
            <h3>{t("Your first chart begins here")}</h3>
            <p>{t("Add birth data to calculate a natal wheel and placements.")}</p>
            <button className="primary" onClick={onNew}>
              {t("Create profile")}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function Profiles({
  profiles,
  reload,
  onOpenChart,
}: {
  profiles: Profile[];
  reload: () => void;
  onOpenChart: (id: number) => void;
}) {
  const {t}=useI18n();
  const [editing, setEditing] = useState<Profile | undefined>(),
    [open, setOpen] = useState(false);
  const del = async (id: number) => {
    if (!confirm(t("Delete this profile and its chart data?"))) return;
    await api(`/profiles/${id}`, { method: "DELETE" });
    reload();
  };
  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">{t("Client archive")}</p>
          <h1>{t("Birth profiles")}</h1>
          <p className="muted">{t("Accurate source data, private notes, and preferred calculation settings.")}</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditing(undefined);
            setOpen(true);
          }}
        >
          <Plus size={17} />
          {t("Add profile")}
        </button>
      </header>
      <div className="table-card">
        <div className="table-tools">
          <div className="search">
            <Search size={16} />
            <input placeholder={t("Search profiles…")} />
          </div>
          <span>
            {profiles.length} {t(profiles.length === 1 ? "profile" : "profiles")}
          </span>
        </div>
        <div className="profiles-list">
          {profiles.map((p) => (
            <div className="profile-row" key={p.id}>
              <div className="avatar">{p.name[0]}</div>
              <div className="grow">
                <strong>
                  {p.name}{" "}
                  {p.isPrimary ? (
                    <span className="primary-tag">{t("Primary")}</span>
                  ) : (
                    ""
                  )}
                </strong>
                <span>
                  {p.birthDate} {t("at")} {p.birthTime} · {p.place}
                </span>
              </div>
              <span className="method">
                {p.zodiac}
                <br />
                {p.houseSystem.replace("_", " ")}
              </span>
              <button className="ghost" onClick={() => onOpenChart(p.id)}>
                {t("Open chart")}
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  setEditing(p);
                  setOpen(true);
                }}
              >
                <Settings size={17} />
              </button>
              <button className="icon-btn danger" onClick={() => del(p.id)}>
                <X size={17} />
              </button>
            </div>
          ))}
        </div>
      </div>
      {open && (
        <ProfileModal
          profile={editing}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function ChartView({
  profiles,
  selected,
  setSelected,
}: {
  profiles: Profile[];
  selected: number | null;
  setSelected: (id: number) => void;
}) {
  const {t,locale}=useI18n();
  const [mode, setMode] = useState<"NATAL" | "TRANSIT" | "PROGRESSION">(
      "NATAL",
    ),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [chart, setChart] = useState<Chart | null>(null),
    [loading, setLoading] = useState(false);
  const profile = profiles.find((p) => p.id === selected) || profiles[0];
  const localPosition = (p:Planet) => `${p.degree}° ${String(p.minute).padStart(2,"0")}′ ${t(p.sign)}${p.retrograde ? " ℞" : ""}`;
  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    api<{ chart: Chart }>(
      `/charts/${profile.id}?mode=${mode}&date=${date}T12:00:00Z`,
    )
      .then((r) => setChart(r.chart))
      .finally(() => setLoading(false));
  }, [profile?.id, mode, date]);
  return (
    <>
      <header className="page-head compact">
        <div>
          <p className="eyebrow">{t("Chart studio")}</p>
          <h1>{profile?.name || t("Select a profile")}</h1>
          <p className="muted">
            {profile &&
              `${profile.birthDate} · ${profile.birthTime} · ${profile.place}`}
          </p>
        </div>
        <div className="head-controls">
          <select
            value={profile?.id || ""}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {profiles.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="ghost no-print" onClick={() => window.print()} disabled={!chart}>
            <Printer size={16} />
            {t("Print")}
          </button>
          <button className="ghost no-print" disabled={!chart} onClick={async () => {
            const svg = document.querySelector(".chart-wheel") as SVGSVGElement | null;
            if (chart && svg && profile) {
              const { exportChartPdf } = await import("./pdfExports");
              await exportChartPdf(profile, chart, svg);
            }
          }}>
            <Download size={16} />
            {t("Export PDF")}
          </button>
        </div>
      </header>
      {!profile ? (
        <div className="empty">
          <Compass />
          <h3>{t("Add a birth profile first")}</h3>
        </div>
      ) : (
        <>
          <section className="print-only print-report-head">
            <p>Asterivum Astrology</p>
            <h1>{profile.name}</h1>
            <span>{t(mode === "NATAL" ? "Natal chart" : mode === "TRANSIT" ? "Transit chart" : "Progression chart")} · {profile.birthDate} · {profile.birthTime} · {profile.place}</span>
          </section>
          <div className="chart-toolbar">
            <div className="tabs">
              {(["NATAL", "TRANSIT", "PROGRESSION"] as const).map((m) => (
                <button
                  className={mode === m ? "active" : ""}
                  onClick={() => setMode(m)}
                  key={m}
                >
                  {t(m[0] + m.slice(1).toLowerCase())}
                </button>
              ))}
            </div>
            {mode !== "NATAL" && (
              <label>
                {t("Target date")}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            )}
            <span className="pill">
              {profile.zodiac} · {profile.houseSystem.replace("_", " ")}
            </span>
          </div>
          {loading || !chart ? (
            <div className="loading">{t("Calculating the sky…")}</div>
          ) : (
            <div className="chart-layout">
              <section className="wheel-card">
                <ChartWheel chart={chart} />
                <div className="chart-legend">
                  <span>
                    <i className="conj" />
                    {t("Conjunction")}
                  </span>
                  <span>
                    <i className="sextile" />
                    {t("Sextile")}
                  </span>
                  <span>
                    <i className="square" />
                    {t("Square")}
                  </span>
                  <span>
                    <i className="trine" />
                    {t("Trine")}
                  </span>
                  <span>
                    <i className="opposition" />
                    {t("Opposition")}
                  </span>
                </div>
              </section>
              <section className="placements-card">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">{t("Celestial positions")}</p>
                    <h2>{t(mode === "NATAL" ? "Placements" : `${mode[0] + mode.slice(1).toLowerCase()} positions`)}</h2>
                  </div>
                  <span>{new Date(chart.chartDate).toLocaleDateString(locale)}</span>
                </div>
                <div className="placements">
                  {chart.planets.map((p) => (
                    <div key={p.name}>
                      <span className="mini-glyph">{p.glyph}</span>
                      <strong>{t(p.name)}</strong>
                      {mode === "NATAL" ? (
                        <span>{localPosition(p)}</span>
                      ) : (
                        <span className="dual-position">
                          <b>N</b> {localPosition(chart.natal.find((natal) => natal.name === p.name) || p)}
                          <br />
                          <b>{mode === "TRANSIT" ? "T" : "P"}</b> {localPosition(p)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="angles">
                  <div>
                    <small>{t("Ascendant").toUpperCase()}</small>
                    <strong>{localPosition(chart.angles.ascendant)}</strong>
                  </div>
                  <div>
                    <small>{t("Midheaven").toUpperCase()}</small>
                    <strong>{localPosition(chart.angles.midheaven)}</strong>
                  </div>
                </div>
                <p className="hint">{t(chart.settings.houseAccuracy)}</p>
              </section>
              <section className="aspects-card">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">{t("Aspect matrix")}</p>
                    <h2>{t("Strongest aspects")}</h2>
                  </div>
                  <span>{chart.aspects.length} {t("found")}</span>
                </div>
                <div className="aspect-list">
                  {chart.aspects.slice(0, 14).map((a, i) => (
                    <div key={i}>
                      <strong>{t(a.from)}</strong>
                      <span className={`aspect-symbol ${a.type.toLowerCase()}`}>
                        {a.glyph}
                      </span>
                      <strong>{t(a.to)}</strong>
                      <span>{t(a.type)}</span>
                      <small>{a.orb.toFixed(2)}° {t("orb")}</small>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Ephemeris() {
  const {t,locale}=useI18n();
  const today = new Date().toISOString().slice(0, 10),
    [start, setStart] = useState(today),
    [end, setEnd] = useState(
      new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    ),
    [step, setStep] = useState(1),
    [rows, setRows] = useState<{ date: string; planets: Planet[] }[]>([]),
    [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await api<{ rows: typeof rows }>(
        `/ephemeris?start=${start}&end=${end}&step=${step}`,
      );
      setRows(r.rows);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">{t("Reference tables")}</p>
          <h1>{t("Astrology ephemeris")}</h1>
          <p className="muted">{t("Compare geocentric tropical longitudes and retrograde motion across any period.")}</p>
        </div>
      </header>
      <div className="filter-card">
        <label>
          {t("From")}
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          {t("To")}
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label>
          {t("Interval")}
          <select
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
          >
            <option value="1">{t("Daily")}</option>
            <option value="7">{t("Weekly")}</option>
            <option value="30">{t("Monthly")}</option>
          </select>
        </label>
        <button className="primary" onClick={load}>
          <Activity size={16} />
          {t(loading ? "Calculating…" : "Calculate")}
        </button>
      </div>
      <div className="ephemeris-card">
        <div className="ephemeris-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Date")}</th>
                {rows[0]?.planets.map((p) => (
                  <th key={p.name}>
                    {p.glyph}
                    <span>{t(p.name).slice(0, 3)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td>
                    {new Date(r.date).toLocaleDateString(locale, {
                      month: "short",
                      day: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                  {r.planets.map((p) => (
                    <td key={p.name} className={p.retrograde ? "is-retro" : ""}>
                      {t(p.sign).slice(0, 3)} {p.degree}°{p.retrograde ? " ℞" : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Forecast({ profiles }: { profiles: Profile[] }) {
  const {t,locale,language}=useI18n();
  const [id, setId] = useState(profiles[0]?.id || 0),
    [months, setMonths] = useState(12),
    [scope, setScope] = useState<"SLOW" | "ALL">("SLOW"),
    [orb, setOrb] = useState(3),
    [events, setEvents] = useState<TransitReportEvent[]>([]),
    [period, setPeriod] = useState({ start: "", end: "" }),
    [loading, setLoading] = useState(false);
  const profile = profiles.find((item) => item.id === id);
  const load = async () => {
    if (!id) return;
    setLoading(true);
    const start = new Date(),
      end = new Date();
    end.setMonth(end.getMonth() + months);
    try {
      const r = await api<{ events: typeof events }>(
        `/transit-reports/${id}?start=${start.toISOString()}&end=${end.toISOString()}&scope=${scope}&orb=${orb}`,
      );
      setEvents(r.events);
      setPeriod({ start: start.toISOString(), end: end.toISOString() });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (id) load();
  }, [id,language]);
  const groups = useMemo(
    () =>
      Object.entries(
        events.reduce<Record<string, typeof events>>((a, e) => {
          const k = new Date(e.startDate).toLocaleDateString(locale, {
            month: "long",
            year: "numeric",
          });
          (a[k] ||= []).push(e);
          return a;
        }, {}),
      ),
    [events,locale],
  );
  const exactPasses = events.reduce((sum, event) => sum + event.exactHits.length, 0);
  const retrogradeReturns = events.reduce((sum, event) => sum + event.exactHits.filter(hit => hit.retrograde).length, 0);
  const formatDay = (value:string) => new Date(value).toLocaleDateString(locale, { day:"2-digit", month:"short", year:"numeric" });
  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">{t("Timing & movement")}</p>
          <h1>{t("Transit forecast")}</h1>
          <p className="muted">{t("A high-signal timeline of exact outer-planet contacts to natal placements.")}</p>
        </div>
      </header>
      <section className="print-only print-report-head">
        <p>Asterivum Astrology · {t("Transit report")}</p>
        <h1>{profile?.name || t("Transit report")}</h1>
        <span>{period.start ? `${formatDay(period.start)} – ${formatDay(period.end)}` : ""} · {t(scope === "SLOW" ? "Slow planets" : "All planets")} · {orb}° {t("orb")}</span>
      </section>
      <div className="filter-card no-print">
        <label>
          {t("Profile")}
          <select value={id} onChange={(e) => setId(Number(e.target.value))}>
            {profiles.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Planets")}
          <select value={scope} onChange={(e) => setScope(e.target.value as "SLOW" | "ALL")}>
            <option value="SLOW">{t("Slow planets")}</option>
            <option value="ALL">{t("All planets")}</option>
          </select>
        </label>
        <label>
          {t("Range")}
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            <option value="6">{t("6 months")}</option>
            <option value="12">{t("1 year")}</option>
            <option value="24">{t("2 years")}</option>
            <option value="36">{t("3 years")}</option>
          </select>
        </label>
        <label>
          {t("Working orb")}
          <select value={orb} onChange={(e) => setOrb(Number(e.target.value))}>
            <option value="1">1° · exact</option>
            <option value="2">2° · focused</option>
            <option value="3">3° · standard</option>
            <option value="5">5° · broad</option>
          </select>
        </label>
        <button className="primary" onClick={load}>
          <Sparkles size={16} />
          {t(loading ? "Reading…" : "Generate forecast")}
        </button>
        <button className="ghost" onClick={() => window.print()} disabled={!events.length}>
          <Printer size={16} /> {t("Print")}
        </button>
        <button className="ghost" onClick={async () => { if(profile){ const {exportTransitPdf}=await import("./pdfExports"); exportTransitPdf(profile,events,period,scope,orb); } }} disabled={!events.length || !profile}>
          <Download size={16} /> {t("Export PDF")}
        </button>
      </div>
      <div className="forecast-layout">
        <aside className="forecast-summary">
          <MoonStar />
          <h3>{events.length} {t("active periods")}</h3>
          <p className="forecast-explanation">{exactPasses} {t("exact passes")} · {retrogradeReturns} {t("retrograde passes")}. {t("Strength uses the closest orb reached inside the selected window.")} ({orb}°)</p>
          <div className="forecast-stats">
            <span><b>{events.filter(event => event.strength >= 80).length}</b> {t("very strong")}</span>
            <span><b>{events.filter(event => event.hasRetrogradePass).length}</b> {t("with retrograde motion")}</span>
          </div>
          <p>{t("Each period runs from orb entry to orb exit and groups repeated direct or retrograde passes.")}</p>
        </aside>
        <section className="timeline">
          {groups.map(([month, items]) => (
            <div className="month-group" key={month}>
              <h3>{month}</h3>
              {items.map((e, i) => (
                <div className="event" key={i}>
                  <time>
                    {new Date(e.startDate).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "short",
                    })}
                  </time>
                  <span className={`event-icon ${e.aspect.toLowerCase()}`}>
                    {e.glyph}
                  </span>
                  <div>
                    <strong>
                      {t(e.transitPlanet)} {t(e.aspect).toLowerCase()} natal {t(e.natalPlanet)}
                    </strong>
                    <p>{e.strengthLabel} · {e.strength}% · {e.peakOrb.toFixed(2)}° closest orb</p>
                    <div className="event-details">
                      <span>{formatDay(e.startDate)} → {formatDay(e.endDate)}</span>
                      <span>{t(e.transitSign)} · {t("natal house")} {e.natalHouse}</span>
                      {e.exactHits.map((hit, hitIndex) => <span key={`${hit.date}-${hitIndex}`}>{t("Pass")} {hitIndex + 1}: {formatDay(hit.date)} · {t(hit.retrograde ? "Retrograde" : "Direct")}</span>)}
                    </div>
                    <p className="transit-interpretation">{e.interpretation}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {!loading && !events.length && (
            <div className="empty">
              <CalendarDays />
              <h3>{t("No contacts in this range")}</h3>
              <p>{t("Try a broader orb, a longer range, or all planets.")}</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Admin() {
  const {t,locale}=useI18n();
  const [data, setData] = useState<{
    stats: Record<string, number>;
    users: (User & { createdAt: string; profileCount: number })[];
  } | null>(null);
  const load = () => api<typeof data>("/admin/overview").then(setData);
  useEffect(() => {
    void load();
  }, []);
  const toggle = async (u: User) => {
    await api(`/admin/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED",
      }),
    });
    load();
  };
  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">{t("Administration")}</p>
          <h1>{t("Practice control room")}</h1>
          <p className="muted">{t("Manage access, monitor adoption, and protect client records.")}</p>
        </div>
        <span className="pill">
          <ShieldCheck size={14} />
          {t("Administrator")}
        </span>
      </header>
      {data && (
        <>
          <div className="stat-row admin-stats">
            <div className="stat">
              <Users />
              <span>{data.stats.users}</span>
              <p>{t("Total users")}</p>
            </div>
            <div className="stat">
              <CircleUserRound />
              <span>{data.stats.profiles}</span>
              <p>{t("Birth profiles")}</p>
            </div>
            <div className="stat">
              <BookOpen />
              <span>{data.stats.reports}</span>
              <p>{t("Saved reports")}</p>
            </div>
            <div className="stat">
              <Activity />
              <span>{data.stats.active30d}</span>
              <p>{t("New in 30 days")}</p>
            </div>
          </div>
          <div className="table-card">
            <div className="section-title">
              <div>
                <p className="eyebrow">{t("Access control")}</p>
                <h2>{t("Users")}</h2>
              </div>
            </div>
            <div className="admin-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("User")}</th>
                    <th>{t("Role")}</th>
                    <th>{t("Profiles")}</th>
                    <th>{t("Joined")}</th>
                    <th>{t("Status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <span>{u.email}</span>
                      </td>
                      <td>{u.role}</td>
                      <td>{u.profileCount}</td>
                      <td>{new Date(u.createdAt).toLocaleDateString(locale)}</td>
                      <td>
                        <span className={`status ${u.status?.toLowerCase()}`}>
                          {u.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="ghost small"
                          onClick={() => toggle(u)}
                        >
                          {t(u.status === "SUSPENDED" ? "Restore" : "Suspend")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default function App() {
  const {t}=useI18n();
  const [user, setUser] = useState<User | null>(null),
    [checkingSession, setCheckingSession] = useState(true),
    [view, setView] = useState<View>("dashboard"),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [modal, setModal] = useState(false),
    [menu, setMenu] = useState(false),
    [toast, setToast] = useState("");
  const loadProfiles = () =>
    api<{ profiles: Profile[] }>("/profiles").then((r) =>
      setProfiles(r.profiles),
    );
  useEffect(() => {
    api<{ user: User }>("/me").then((r) => setUser(r.user)).catch(() => undefined).finally(() => setCheckingSession(false));
  }, []);
  useEffect(() => {
    if (user) loadProfiles();
  }, [user]);
  const nav = (v: View, id?: number) => {
    setView(v);
    if (id) setSelected(id);
    setMenu(false);
  };
  if (checkingSession) return <main className="auth-shell" aria-busy="true" />;
  if (!user)
    return (
      <Auth
        onAuth={setUser}
      />
    );
  const items = [
    ["dashboard", t("Overview"), LayoutDashboard],
    ["profiles", t("Birth profiles"), Users],
    ["chart", t("Chart studio"), Compass],
    ["ephemeris", t("Ephemeris"), Database],
    ["forecast", t("Forecasts"), CalendarDays],
    ["synastry", t("Synastry"), HeartHandshake],
    ["astromap", t("Astro map"), Globe2],
  ] as const;
  return (
    <div className="app-shell">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="logo">
          <img className="brand-icon" src="/brand/asterivum-icon.png" alt="" />
          <div>
            <strong>Asterivum</strong>
            <span>{t("Astrology Studio")}</span>
          </div>
          <button className="close-menu" onClick={() => setMenu(false)}>
            <X />
          </button>
        </div>
        <nav>
          {items.map(([v, label, Icon]) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              onClick={() => nav(v)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        {user.role === "ADMIN" && (
          <div className="admin-nav">
            <span>{t("Management")}</span>
            <button
              className={view === "admin" ? "active" : ""}
              onClick={() => nav("admin")}
            >
              <ShieldCheck size={19} />
              {t("Administration")}
            </button>
          </div>
        )}
        <div className="sidebar-language"><LanguageSwitch compact /></div>
        <div className="side-foot">
          <div className="user-chip">
            <div className="avatar">{user.name[0]}</div>
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <button
            className="logout"
            onClick={() => { api("/auth/logout", { method:"POST" }).finally(() => setUser(null)); }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="mobile-top">
          <button onClick={() => setMenu(true)}>
            <Menu />
          </button>
          <strong>Asterivum</strong>
          <span />
        </div>
        <div className="content">
          {view === "dashboard" && (
            <Dashboard
              profiles={profiles}
              onView={nav}
              onNew={() => setModal(true)}
            />
          )}{" "}
          {view === "profiles" && (
            <Profiles
              profiles={profiles}
              reload={loadProfiles}
              onOpenChart={(id) => nav("chart", id)}
            />
          )}{" "}
          {view === "chart" && (
            <ChartView
              profiles={profiles}
              selected={selected}
              setSelected={setSelected}
            />
          )}{" "}
          {view === "ephemeris" && <Ephemeris />}{" "}
          {view === "forecast" && <Forecast profiles={profiles} />}{" "}
          {view === "synastry" && <SynastryView profiles={profiles} />}{" "}
          {view === "astromap" && <AstroMapView profiles={profiles} />}{" "}
          {view === "admin" && user.role === "ADMIN" && <Admin />}
        </div>
      </main>
      {modal && (
        <ProfileModal
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            loadProfiles();
            setToast("Birth profile saved");
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}

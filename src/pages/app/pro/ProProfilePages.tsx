import { useEffect, useState, type ReactNode } from "react";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/Input";
import { HumanStatus, StatusBanner } from "../../../components/ui/StatusBanner";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  addCredential,
  addPortfolioItem,
  deletePortfolioItem,
  fetchContractorAreas,
  fetchContractorProfileByUser,
  fetchContractorServices,
  fetchCredentials,
  fetchPortfolio,
  fetchServiceCategories,
  setContractorServices,
  signedContractorDocUrl,
  updateContractorProfile,
  updateCredential,
  updateProfileAvatar,
  uploadContractorDoc,
  upsertContractorArea,
} from "../../../lib/marketplace/api";
import { centsToDollarString, dollarsToCents } from "../../../lib/marketplace/fees";
import { MANAGE_PROFILE_SECTIONS, showManageProfile, verifiedBadgeVisible } from "../../../lib/marketplace/profileManage";
import type { ServiceAreaMode, ServiceCategory } from "../../../lib/marketplace/types";
import { PRO_DASHBOARD_PRICING_NOTE } from "../../../data/pricing";
import { useToast } from "../../../hooks/useToast";
import { ProOnboardingPage } from "./ProMarketplacePages";

export function ProProfilePage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"loading" | "manage" | "onboarding">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void fetchContractorProfileByUser(user.id)
      .then((row) => {
        if (!row) throw new Error("Contractor profile missing.");
        setMode(showManageProfile(row) ? "manage" : "onboarding");
      })
      .catch((err: Error) => setError(err.message));
  }, [user]);

  if (error) return <p className="text-sm text-danger-600">{error}</p>;
  if (mode === "loading") return <p className="text-sm text-ink-500">Loading profile…</p>;
  if (mode === "onboarding") return <ProOnboardingPage />;
  return <ManageProfileView />;
}

export function ManageProfileView() {
  const { user, profile, refreshProfile } = useAuth();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [identityReview, setIdentityReview] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [years, setYears] = useState("");
  const [accepting, setAccepting] = useState(true);
  const [minJob, setMinJob] = useState("");
  const [maxJob, setMaxJob] = useState("");
  const [license, setLicense] = useState("");
  const [insurance, setInsurance] = useState("");
  const [website, setWebsite] = useState("");
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [zips, setZips] = useState("");
  const [centerZip, setCenterZip] = useState("");
  const [radius, setRadius] = useState("");
  const [mode, setMode] = useState<ServiceAreaMode>("ZIPS");
  const [areaId, setAreaId] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [badges, setBadges] = useState<{ id: string; label: string; status: string }[]>([]);
  const [credentials, setCredentials] = useState<Awaited<ReturnType<typeof fetchCredentials>>>([]);

  async function load() {
    if (!user) return;
    const [profileRow, cats] = await Promise.all([
      fetchContractorProfileByUser(user.id),
      fetchServiceCategories(),
    ]);
    if (!profileRow) throw new Error("Contractor profile missing.");
    setContractorId(profileRow.id);
    setApproved(profileRow.approval_status === "APPROVED");
    setIdentityReview(Boolean(profileRow.identity_review_required));
    setBusinessName(profileRow.business_name);
    setHeadline(profileRow.headline ?? "");
    setBio(profileRow.bio ?? "");
    setYears(profileRow.years_experience?.toString() ?? "");
    setAccepting(profileRow.accepting_work);
    setMinJob(centsToDollarString(profileRow.min_job_cents));
    setMaxJob(centsToDollarString(profileRow.max_job_cents));
    setLicense(profileRow.license_number ?? "");
    setInsurance(profileRow.insurance_carrier ?? "");
    setWebsite(profileRow.website_url ?? "");
    setCategories(cats);
    const services = await fetchContractorServices(profileRow.id);
    setSelected(services.map((s) => s.category_id));
    const areas = await fetchContractorAreas(profileRow.id);
    const area = areas[0];
    if (area) {
      setAreaId(area.id);
      setMode(area.mode);
      setZips((area.zip_codes ?? []).join(", "));
      setCenterZip(area.center_zip ?? "");
      setRadius(area.radius_miles?.toString() ?? "");
    }
    const creds = await fetchCredentials(profileRow.id);
    setCredentials(creds);
    setBadges(creds.filter((c) => verifiedBadgeVisible(c.status)).map((c) => ({ id: c.id, label: c.label, status: c.status })));
    if (profile?.avatar_url) {
      setPhotoUrl((await signedContractorDocUrl(profile.avatar_url)) ?? profile.avatar_url);
    }
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function saveBusiness() {
    if (!contractorId) return;
    setBusy(true);
    setError(null);
    try {
      await updateContractorProfile(contractorId, {
        business_name: businessName,
        website_url: website || null,
      });
      toast.push("Business saved.");
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAbout() {
    if (!contractorId) return;
    setBusy(true);
    setError(null);
    try {
      await updateContractorProfile(contractorId, {
        headline,
        bio,
      });
      toast.push("About saved.");
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveExperience() {
    if (!contractorId) return;
    setBusy(true);
    setError(null);
    try {
      await updateContractorProfile(contractorId, {
        years_experience: years ? Number(years) : null,
        min_job_cents: dollarsToCents(minJob),
        max_job_cents: dollarsToCents(maxJob),
      });
      toast.push("Experience saved.");
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveServices() {
    if (!contractorId) return;
    setBusy(true);
    setError(null);
    try {
      await setContractorServices(contractorId, selected);
      toast.push("Services saved.");
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveArea() {
    if (!contractorId) return;
    setBusy(true);
    setError(null);
    try {
      await upsertContractorArea({
        id: areaId,
        contractor_profile_id: contractorId,
        mode,
        zip_codes: zips
          .split(/[\s,]+/)
          .map((z) => z.trim())
          .filter(Boolean),
        center_zip: centerZip || null,
        radius_miles: radius ? Number(radius) : null,
        label: "Primary area",
      });
      toast.push("Service area saved.");
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveIdentity() {
    if (!contractorId) return;
    setBusy(true);
    setError(null);
    try {
      await updateContractorProfile(contractorId, {
        license_number: license || null,
        insurance_carrier: insurance || null,
      });
      setIdentityReview(true);
      setCredentials(await fetchCredentials(contractorId));
      toast.push("License details saved. That credential is pending re-verification. Your approved status stays.");
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccepting() {
    if (!contractorId) return;
    const next = !accepting;
    setAccepting(next);
    try {
      await updateContractorProfile(contractorId, { accepting_work: next });
      toast.push(next ? "You are accepting work." : "You paused new work.");
    } catch (err) {
      setAccepting(!next);
      setError(err instanceof Error ? err.message : "Could not update accepting work.");
    }
  }

  const serviceNames = categories.filter((c) => selected.includes(c.id)).map((c) => c.name);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Priority Pro</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Your Pro Profile</h1>
        <p className="mt-2 text-sm text-ink-700">
          Update the public card customers see. Onboarding answers stay on file.
          {` ${PRO_DASHBOARD_PRICING_NOTE}`}
        </p>
        <ButtonLink to="/app/pro/account" variant="ghost" size="sm" className="mt-2 px-0">
          Account
        </ButtonLink>
      </header>
      <FormError message={error} />
      {approved ? (
        <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl text-forest-800">Your Pro Profile</h2>
            <span className="shrink-0 rounded-full bg-forest-800 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-cream-50">
              ✓ Approved
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-700">Approved status is admin-controlled and stays after ordinary profile edits.</p>
        </section>
      ) : null}
      {identityReview ? (
        <StatusBanner
          tone="warning"
          title="Credential re-verification required"
          body="Changing a verified license, insurance, or credential document marks that credential pending review and hides its verified badge. Your approved and active status stay."
        />
      ) : null}

      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-forest-800">Accepting Work</h2>
            <p className="text-sm text-ink-700">{accepting ? "You are open to new jobs." : "New matching is paused. Historical estimates stay."}</p>
          </div>
          <label className="flex min-h-12 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={accepting} onChange={() => void toggleAccepting()} />
            {accepting ? "On" : "Off"}
          </label>
        </div>
      </section>

      <SectionCard
        title="Business"
        actionLabel="Edit"
        editing={editing === "business"}
        onEdit={() => setEditing(editing === "business" ? null : "business")}
      >
        {photoUrl ? <img src={photoUrl} alt="" className="mb-3 h-24 w-24 rounded-full object-cover" /> : <p className="text-sm text-ink-500">No profile photo yet.</p>}
        {editing === "business" ? (
          <div className="space-y-3">
            <TextInput label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            <TextInput label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
            {user ? (
              <input
                className="block"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Upload profile photo"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void uploadContractorDoc({ userId: user.id, folder: "portfolio", file })
                    .then(async (path) => {
                      await updateProfileAvatar(user.id, path);
                      await refreshProfile();
                      setPhotoUrl((await signedContractorDocUrl(path)) ?? path);
                      toast.push("Photo saved.");
                    })
                    .catch((err: Error) => setError(err.message));
                }}
              />
            ) : null}
            <Button type="button" size="sm" disabled={busy} onClick={() => void saveBusiness()}>
              Save business
            </Button>
          </div>
        ) : (
          <div className="space-y-1 text-sm text-ink-700">
            <p className="font-semibold text-forest-800">{businessName || "Your business"}</p>
            <p>{website || "No website yet."}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="About"
        actionLabel="Edit"
        editing={editing === "about"}
        onEdit={() => setEditing(editing === "about" ? null : "about")}
      >
        {editing === "about" ? (
          <div className="space-y-3">
            <TextInput label="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
            <label className="block">
              <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Bio</span>
              <textarea className="w-full rounded-2xl border border-forest-800/15 px-4 py-3" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
            </label>
            <Button type="button" size="sm" disabled={busy} onClick={() => void saveAbout()}>
              Save about
            </Button>
          </div>
        ) : (
          <div className="space-y-1 text-sm text-ink-700">
            <p>{headline || "No headline yet."}</p>
            <p>{bio || "No bio yet."}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Services"
        actionLabel="Edit"
        editing={editing === "services"}
        onEdit={() => setEditing(editing === "services" ? null : "services")}
      >
        {editing === "services" ? (
          <div className="space-y-3">
            {categories.map((cat) => (
              <label key={cat.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(cat.id)}
                  onChange={(e) =>
                    setSelected((current) =>
                      e.target.checked ? [...current, cat.id] : current.filter((id) => id !== cat.id),
                    )
                  }
                />
                {cat.name}
              </label>
            ))}
            <Button type="button" size="sm" disabled={busy} onClick={() => void saveServices()}>
              Save services
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-700">{serviceNames.length ? serviceNames.join(" · ") : "No services selected."}</p>
        )}
      </SectionCard>

      <SectionCard
        title="Service Area"
        actionLabel="Edit"
        editing={editing === "area"}
        onEdit={() => setEditing(editing === "area" ? null : "area")}
      >
        {editing === "area" ? (
          <div className="space-y-3">
            <select
              className="min-h-14 w-full rounded-2xl border border-forest-800/15 px-4"
              value={mode}
              onChange={(e) => setMode(e.target.value as ServiceAreaMode)}
            >
              <option value="ZIPS">ZIP list</option>
              <option value="RADIUS">Radius from a center ZIP</option>
              <option value="ZIPS_AND_RADIUS">ZIPs and radius</option>
            </select>
            <TextInput label="ZIPs (comma separated)" value={zips} onChange={(e) => setZips(e.target.value)} />
            <TextInput label="Center ZIP" value={centerZip} onChange={(e) => setCenterZip(e.target.value)} />
            <TextInput label="Radius (miles)" value={radius} onChange={(e) => setRadius(e.target.value)} />
            <Button type="button" size="sm" disabled={busy} onClick={() => void saveArea()}>
              Save area
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-700">
            {zips || centerZip ? [zips, centerZip && `Center ${centerZip}`, radius && `${radius} miles`].filter(Boolean).join(" · ") : "No service area yet."}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Experience"
        actionLabel="Edit"
        editing={editing === "experience"}
        onEdit={() => setEditing(editing === "experience" ? null : "experience")}
      >
        {editing === "experience" ? (
          <div className="space-y-3">
            <TextInput label="Years in business" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
            <TextInput label="Min job size (USD)" value={minJob} onChange={(e) => setMinJob(e.target.value)} />
            <TextInput label="Max job size (USD)" value={maxJob} onChange={(e) => setMaxJob(e.target.value)} />
            <Button type="button" size="sm" disabled={busy} onClick={() => void saveExperience()}>
              Save experience
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-700">{years ? `${years} years in business` : "Years in business not set."}</p>
        )}
      </SectionCard>

      <SectionCard
        title="Credentials"
        actionLabel="Manage"
        editing={editing === "credentials"}
        onEdit={() => setEditing(editing === "credentials" ? null : "credentials")}
      >
        <p className="text-sm text-ink-700">
          Changing a verified license, insurance, or document marks that credential pending re-verification. Your approved status stays.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {credentials.map((cred) => (
            <li key={cred.id} className="rounded-2xl bg-cream-100 px-3 py-2">
              <p className="font-semibold text-forest-800">
                {cred.label} · {cred.kind}
                {verifiedBadgeVisible(cred.status) ? " · Verified" : ` · ${cred.status.replaceAll("_", " ")}`}
              </p>
            </li>
          ))}
        </ul>
        {editing === "credentials" ? (
          <div className="mt-3 space-y-3">
            <TextInput label="License number" value={license} onChange={(e) => setLicense(e.target.value)} />
            <TextInput label="Insurance carrier" value={insurance} onChange={(e) => setInsurance(e.target.value)} />
            <Button type="button" size="sm" disabled={busy} onClick={() => void saveIdentity()}>
              Save license details
            </Button>
            {contractorId && user ? (
              <CredentialsManage
                contractorId={contractorId}
                userId={user.id}
                rows={credentials}
                onChange={setCredentials}
                onError={setError}
              />
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      {contractorId && user ? (
        <PortfolioManage
          contractorId={contractorId}
          userId={user.id}
          editing={editing === "portfolio"}
          onEdit={() => setEditing(editing === "portfolio" ? null : "portfolio")}
          onError={setError}
        />
      ) : null}

      <section className="rounded-3xl border border-forest-800/10 px-5 py-4">
        <h2 className="font-display text-2xl text-forest-800">Account status</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Approval</dt>
            <dd className="font-semibold">{approved ? "APPROVED" : "Pending"} — not editable</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Account</dt>
            <dd className="font-semibold">ACTIVE status is admin-controlled</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Verification badges</dt>
            <dd className="font-semibold">{badges.length ? badges.map((b) => b.label).join(", ") : "None"} — not self-assignable</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Marketplace fee</dt>
            <dd className="font-semibold">Platform-configured — not editable</dd>
          </div>
        </dl>
      </section>
      <p className="sr-only">{MANAGE_PROFILE_SECTIONS.map((s) => s.title).join(", ")}</p>
    </div>
  );
}

function SectionCard({
  title,
  actionLabel,
  editing,
  onEdit,
  children,
}: {
  title: string;
  actionLabel: string;
  editing: boolean;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-forest-800">{title}</h2>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          {editing ? "Close" : actionLabel}
        </Button>
      </div>
      {children}
    </section>
  );
}

function CredentialsManage({
  contractorId,
  userId,
  rows,
  onChange,
  onError,
}: {
  contractorId: string;
  userId: string;
  rows: Awaited<ReturnType<typeof fetchCredentials>>;
  onChange: (rows: Awaited<ReturnType<typeof fetchCredentials>>) => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.16em] text-gold-700">Documents</p>
      {rows.map((row) => (
        <div key={row.id} className="rounded-2xl bg-cream-100 px-3 py-2 text-sm">
          <p>
            {row.label} · {verifiedBadgeVisible(row.status) ? "Verified badge shown" : "Verified badge hidden"}
          </p>
          <input
            className="mt-2 block"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            aria-label={`Replace ${row.label} document`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void uploadContractorDoc({ userId, folder: "credentials", file })
                .then((path) => updateCredential(row.id, { document_path: path, status: "PENDING" }))
                .then(() => fetchCredentials(contractorId))
                .then(onChange)
                .catch((err: Error) => onError(err.message));
            }}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void addCredential({
            contractor_profile_id: contractorId,
            kind: "OTHER",
            label: "Additional credential",
            status: "NOT_SUBMITTED",
          })
            .then(() => fetchCredentials(contractorId))
            .then(onChange)
            .catch((err: Error) => onError(err.message));
        }}
      >
        Add credential
      </Button>
    </div>
  );
}

function PortfolioManage({
  contractorId,
  userId,
  editing,
  onEdit,
  onError,
}: {
  contractorId: string;
  userId: string;
  editing: boolean;
  onEdit: () => void;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchPortfolio>>>([]);
  useEffect(() => {
    void fetchPortfolio(contractorId).then(setRows).catch((err: Error) => onError(err.message));
  }, [contractorId, onError]);
  return (
    <SectionCard title="Portfolio" actionLabel="Manage Photos" editing={editing} onEdit={onEdit}>
      <p className="text-sm text-ink-500">
        {rows.length} photo(s). New uploads stay private until a human marks them public-safe. Original filenames are
        not shown on public browse.
      </p>
      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Add portfolio photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void uploadContractorDoc({ userId, folder: "portfolio", file })
                .then((path) =>
                  addPortfolioItem({
                    contractor_profile_id: contractorId,
                    title: "Portfolio photo",
                    storage_path: path,
                    privacy_state: "REVIEW_REQUIRED",
                  }),
                )
                .then(() => fetchPortfolio(contractorId))
                .then(setRows)
                .catch((err: Error) => onError(err.message));
            }}
          />
          <ul className="space-y-2 text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-2xl bg-cream-100 px-3 py-2">
                <span>{row.title || "Photo"}</span>
                <button
                  type="button"
                  className="min-h-11 font-semibold text-danger-600"
                  onClick={() =>
                    void deletePortfolioItem(row.id)
                      .then(() => fetchPortfolio(contractorId))
                      .then(setRows)
                      .catch((err: Error) => onError(err.message))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}

export function ManageProfileBadge({ approved }: { approved: boolean }) {
  if (!approved) return null;
  return <HumanStatus label="Approved" />;
}

import { useEffect, useState, type ReactNode } from "react";
import { BottomSheet } from "../../ui/BottomSheet";
import { Button } from "../../ui/Button";
import { adminFieldClass } from "../shell/AdminFilters";
import {
  ACCOUNT_STATUSES,
  APPROVAL_STATUSES,
  AREA_MODES,
  CREDENTIAL_KINDS,
  CREDENTIAL_STATUSES,
  NOTIFICATION_CATEGORIES,
  PHOTO_STATES,
  TIMINGS,
  buildContractorPatch,
  buildCustomerPatch,
  describePatch,
  fetchContractorEditor,
  fetchCustomerEditor,
  patchNeedsStepUp,
  saveContractorProfile,
  saveCustomerProfile,
  validateReason,
  type Category,
  type ContractorEditor,
  type CustomerEditor,
  type Patch,
} from "../../../lib/admin/profileEditorApi";

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block min-w-0 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">{label}</span>
      {children}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  wide,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} wide={wide}>
      <input className={adminFieldClass} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function AreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label} wide>
      <textarea className={`${adminFieldClass} min-h-24 py-2`} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  blank,
}: {
  label: string;
  value: string;
  options: readonly string[] | Category[];
  onChange: (value: string) => void;
  blank?: string;
}) {
  return (
    <Field label={label}>
      <select className={adminFieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {blank != null ? <option value="">{blank}</option> : null}
        {options.map((option) =>
          typeof option === "string" ? (
            <option key={option} value={option}>
              {titleCase(option)}
            </option>
          ) : (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ),
        )}
      </select>
    </Field>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <fieldset className="space-y-3 rounded-2xl bg-cream-100 px-3 py-3">
      <legend className="sr-only">{title}</legend>
      <h4 className="font-display text-lg text-forest-800">{title}</h4>
      {note ? <p className="text-xs text-ink-500">{note}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** Confirm dialog with the required reason note. Lists what will change before anything is saved. */
export function ProfileSaveDialog({
  open,
  changes,
  sensitive,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  changes: string[];
  sensitive: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setReasonError(null);
    }
  }, [open]);

  return (
    <BottomSheet open={open} title="Save profile changes?" onClose={busy ? () => undefined : onClose}>
      <p className="text-sm text-ink-700">These fields will change:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-forest-800">
        {changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
      {sensitive ? (
        <p className="mt-3 text-sm text-ink-700">
          This includes a sign-in, contact, or status change. If admin two-factor is on, you will be asked for a current authenticator code.
        </p>
      ) : null}
      <p className="mt-3 text-sm text-ink-700">Payments, fees, and Stripe records are not changed here. Each save is recorded in the audit log.</p>
      <label className="mt-4 block text-sm">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Reason for this change (required)</span>
        <textarea
          className={`${adminFieldClass} min-h-24 py-2`}
          value={reason}
          maxLength={500}
          aria-label="Reason for this change"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {reasonError || error ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {reasonError ?? error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-col gap-2">
        <Button
          type="button"
          className="min-h-14 w-full"
          disabled={busy}
          onClick={() => {
            try {
              onConfirm(validateReason(reason));
              setReasonError(null);
            } catch (failure) {
              setReasonError(failure instanceof Error ? failure.message : "Enter a reason.");
            }
          }}
        >
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-12 w-full" disabled={busy} onClick={onClose}>
          Keep editing
        </Button>
      </div>
    </BottomSheet>
  );
}

type EditorState<T> = {
  original: T | null;
  draft: T | null;
  loading: boolean;
  error: string | null;
};

function useProfileEditor<T>(load: () => Promise<T>, save: (patch: Patch, reason: string) => Promise<T>, build: (original: T, draft: T) => Patch, onSaved?: () => void) {
  const [state, setState] = useState<EditorState<T>>({ original: null, draft: null, loading: false, error: null });
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Patch | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function start() {
    setOpen(true);
    setNotice(null);
    setState({ original: null, draft: null, loading: true, error: null });
    try {
      const loaded = await load();
      setState({ original: loaded, draft: structuredClone(loaded), loading: false, error: null });
    } catch (failure) {
      setState({ original: null, draft: null, loading: false, error: failure instanceof Error ? failure.message : "Could not load the editor." });
    }
  }

  function update(next: (draft: T) => T) {
    setState((current) => (current.draft ? { ...current, draft: next(current.draft) } : current));
  }

  function review() {
    if (!state.original || !state.draft) return;
    try {
      const patch = build(state.original, state.draft);
      if (Object.keys(patch).length === 0) {
        setState((current) => ({ ...current, error: "No changes to save." }));
        return;
      }
      setState((current) => ({ ...current, error: null }));
      setSaveError(null);
      setPending(patch);
    } catch (failure) {
      setState((current) => ({ ...current, error: failure instanceof Error ? failure.message : "Check the highlighted fields." }));
    }
  }

  async function confirm(reason: string) {
    if (!pending) return;
    setBusy(true);
    setSaveError(null);
    try {
      const saved = await save(pending, reason);
      setPending(null);
      setOpen(false);
      setState({ original: saved, draft: null, loading: false, error: null });
      setNotice("Profile saved. The change is in the audit log.");
      onSaved?.();
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : "Could not save those changes.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setOpen(false);
    setPending(null);
    setState({ original: null, draft: null, loading: false, error: null });
  }

  return { state, open, pending, busy, saveError, notice, start, update, review, confirm, cancel, closeDialog: () => setPending(null) };
}

type EditorApi<T> = ReturnType<typeof useProfileEditor<T>>;

function EditorFrame<T>({ label, editor, children }: { label: string; editor: EditorApi<T>; children: ReactNode }) {
  if (!editor.open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void editor.start()}>
          Edit profile
        </Button>
        {editor.notice ? (
          <p role="status" className="text-sm font-semibold text-forest-800">
            {editor.notice}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <section aria-label={label} className="space-y-3 rounded-3xl border border-forest-800/15 bg-cream-50 px-3 py-3">
      <h3 className="font-display text-xl text-forest-800">{label}</h3>
      {editor.state.loading ? <p className="text-sm text-ink-700">Loading…</p> : null}
      {editor.state.draft ? children : null}
      {editor.state.error ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {editor.state.error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        {editor.state.draft ? (
          <Button type="button" size="sm" onClick={editor.review}>
            Review and save
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={editor.cancel}>
          Cancel
        </Button>
      </div>
      <ProfileSaveDialog
        open={editor.pending != null}
        changes={editor.pending ? describePatch(editor.pending) : []}
        sensitive={editor.pending ? patchNeedsStepUp(editor.pending) : false}
        busy={editor.busy}
        error={editor.saveError}
        onConfirm={(reason) => void editor.confirm(reason)}
        onClose={editor.closeDialog}
      />
    </section>
  );
}

function PersonFields<T extends { firstName: string; lastName: string; email: string; phone: string; avatarUrl: string; accountStatus: string }>({
  draft,
  update,
  nameLabel = "",
}: {
  draft: T;
  update: (next: (draft: T) => T) => void;
  nameLabel?: string;
}) {
  return (
    <Section title={nameLabel ? `${nameLabel} and sign-in` : "Name and sign-in"} note="Email, phone, and account status are sensitive changes.">
      <TextField label="First name" value={draft.firstName} onChange={(value) => update((d) => ({ ...d, firstName: value }))} />
      <TextField label="Last name" value={draft.lastName} onChange={(value) => update((d) => ({ ...d, lastName: value }))} />
      <TextField label="Sign-in email" type="email" value={draft.email} onChange={(value) => update((d) => ({ ...d, email: value }))} />
      <TextField label="Phone" type="tel" value={draft.phone} placeholder="10-digit phone" onChange={(value) => update((d) => ({ ...d, phone: value }))} />
      <TextField label="Avatar URL" wide value={draft.avatarUrl} placeholder="https://… or a storage path" onChange={(value) => update((d) => ({ ...d, avatarUrl: value }))} />
      <SelectField label="Account status" value={draft.accountStatus} options={ACCOUNT_STATUSES} onChange={(value) => update((d) => ({ ...d, accountStatus: value }))} />
    </Section>
  );
}

export function CustomerProfileEditor({ profileId, onSaved }: { profileId: string; onSaved?: () => void }) {
  const editor = useProfileEditor<CustomerEditor>(
    () => fetchCustomerEditor(profileId),
    (patch, reason) => saveCustomerProfile(profileId, patch, reason),
    buildCustomerPatch,
    onSaved,
  );
  const draft = editor.state.draft;
  const update = editor.update;
  return (
    <EditorFrame label="Edit homeowner profile" editor={editor}>
      {draft ? (
        <div className="space-y-3">
          <PersonFields draft={draft} update={update} />
          <Section title="Address and service location" note="Private. Only this homeowner and admins can see it.">
            <TextField label="Street" value={draft.location.streetLine1} onChange={(value) => update((d) => ({ ...d, location: { ...d.location, streetLine1: value } }))} />
            <TextField label="Unit" value={draft.location.streetLine2} onChange={(value) => update((d) => ({ ...d, location: { ...d.location, streetLine2: value } }))} />
            <TextField label="City" value={draft.location.city} onChange={(value) => update((d) => ({ ...d, location: { ...d.location, city: value } }))} />
            <TextField label="State" value={draft.location.state} onChange={(value) => update((d) => ({ ...d, location: { ...d.location, state: value } }))} />
            <TextField label="ZIP" value={draft.location.zipCode} onChange={(value) => update((d) => ({ ...d, location: { ...d.location, zipCode: value } }))} />
          </Section>
          <fieldset className="space-y-2 rounded-2xl bg-cream-100 px-3 py-3">
            <legend className="sr-only">Notification preferences</legend>
            <h4 className="font-display text-lg text-forest-800">Notification preferences</h4>
            <ul className="space-y-2">
              {NOTIFICATION_CATEGORIES.map((category) => {
                const pref = draft.notifications.find((item) => item.category === category) ?? { category, inApp: true, push: false, email: false };
                const set = (key: "inApp" | "push" | "email", value: boolean) =>
                  update((d) => {
                    const others = d.notifications.filter((item) => item.category !== category);
                    return { ...d, notifications: [...others, { ...pref, [key]: value }] };
                  });
                return (
                  <li key={category} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="min-w-32 font-semibold text-forest-800">{titleCase(category)}</span>
                    {(["inApp", "push", "email"] as const).map((key) => (
                      <label key={key} className="inline-flex min-h-11 items-center gap-2">
                        <input type="checkbox" checked={pref[key]} onChange={(event) => set(key, event.target.checked)} />
                        {key === "inApp" ? "In app" : key === "push" ? "Push" : "Email"}
                      </label>
                    ))}
                  </li>
                );
              })}
            </ul>
          </fieldset>
          {draft.projects.map((project, index) => {
            const setProject = (patch: Partial<typeof project>) =>
              update((d) => ({ ...d, projects: d.projects.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
            return (
              <Section key={project.projectId} title={`Project: ${project.title || "Untitled"}`} note={`Status ${titleCase(project.status)}. Status and money stay on the project tools.`}>
                <TextField label="Title" wide value={project.title} onChange={(value) => setProject({ title: value })} />
                <AreaField label="Description" value={project.description} onChange={(value) => setProject({ description: value })} />
                <SelectField label="Category" value={project.categoryId} options={draft.categories} blank="No category" onChange={(value) => setProject({ categoryId: value })} />
                <SelectField label="Timeline" value={project.timing} options={TIMINGS} blank="Not set" onChange={(value) => setProject({ timing: value })} />
                <TextField label="Preferred date" type="date" value={project.preferredDate} onChange={(value) => setProject({ preferredDate: value })} />
                <TextField label="Street" value={project.streetLine1} onChange={(value) => setProject({ streetLine1: value })} />
                <TextField label="Unit" value={project.streetLine2} onChange={(value) => setProject({ streetLine2: value })} />
                <TextField label="City" value={project.city} onChange={(value) => setProject({ city: value })} />
                <TextField label="State" value={project.state} onChange={(value) => setProject({ state: value })} />
                <TextField label="ZIP" value={project.zipCode} onChange={(value) => setProject({ zipCode: value })} />
              </Section>
            );
          })}
        </div>
      ) : null}
    </EditorFrame>
  );
}

export function ContractorProfileEditor({ contractorProfileId, onSaved }: { contractorProfileId: string; onSaved?: () => void }) {
  const editor = useProfileEditor<ContractorEditor>(
    () => fetchContractorEditor(contractorProfileId),
    (patch, reason) => saveContractorProfile(contractorProfileId, patch, reason),
    buildContractorPatch,
    onSaved,
  );
  const draft = editor.state.draft;
  const update = editor.update;
  return (
    <EditorFrame label="Edit contractor profile" editor={editor}>
      {draft ? (
        <div className="space-y-3">
          <Section title="Business">
            <TextField label="Business name" wide value={draft.businessName} onChange={(value) => update((d) => ({ ...d, businessName: value }))} />
            <TextField label="Headline" wide value={draft.headline} onChange={(value) => update((d) => ({ ...d, headline: value }))} />
            <AreaField label="Bio" value={draft.bio} onChange={(value) => update((d) => ({ ...d, bio: value }))} />
            <TextField label="Primary trade" value={draft.primaryTrade} onChange={(value) => update((d) => ({ ...d, primaryTrade: value }))} />
          </Section>
          <PersonFields draft={draft} update={update} nameLabel="Contact name" />
          <Section title="Approval and visibility" note="Approval status and directory visibility are sensitive changes. Fee status is not changed here.">
            <SelectField label="Approval status" value={draft.approvalStatus} options={APPROVAL_STATUSES} onChange={(value) => update((d) => ({ ...d, approvalStatus: value }))} />
            <div className="min-w-0 text-sm">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Directory visibility</span>
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={!draft.directoryHidden} onChange={(event) => update((d) => ({ ...d, directoryHidden: !event.target.checked }))} />
                Show in the public directory
              </label>
            </div>
            <p className="text-xs text-ink-500 sm:col-span-2">{draft.directoryListed ? "Listed now." : "Not listed now (approval, account status, activation, or visibility)."}</p>
          </Section>
          <Section title="License and insurance">
            <TextField label="License number" value={draft.licenseNumber} onChange={(value) => update((d) => ({ ...d, licenseNumber: value }))} />
            <TextField label="Insurance carrier" value={draft.insuranceCarrier} onChange={(value) => update((d) => ({ ...d, insuranceCarrier: value }))} />
          </Section>
          <fieldset className="space-y-2 rounded-2xl bg-cream-100 px-3 py-3">
            <legend className="sr-only">Services</legend>
            <h4 className="font-display text-lg text-forest-800">Services</h4>
            <div className="grid gap-1 sm:grid-cols-2">
              {draft.categories.map((category) => (
                <label key={category.id} className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.serviceCategoryIds.includes(category.id)}
                    onChange={(event) =>
                      update((d) => ({
                        ...d,
                        serviceCategoryIds: event.target.checked
                          ? [...d.serviceCategoryIds, category.id]
                          : d.serviceCategoryIds.filter((id) => id !== category.id),
                      }))
                    }
                  />
                  {category.name}
                </label>
              ))}
            </div>
          </fieldset>
          {draft.serviceAreas.map((area, index) => {
            const setArea = (patch: Partial<typeof area>) =>
              update((d) => ({ ...d, serviceAreas: d.serviceAreas.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
            return (
              <Section key={area.id ?? `new-${index}`} title={`Service area ${index + 1}`}>
                <SelectField label="Mode" value={area.mode} options={AREA_MODES} onChange={(value) => setArea({ mode: value })} />
                <TextField label="Label" value={area.label} onChange={(value) => setArea({ label: value })} />
                <TextField label="Center ZIP" value={area.centerZip} onChange={(value) => setArea({ centerZip: value })} />
                <TextField label="Radius (miles)" type="number" value={area.radiusMiles} onChange={(value) => setArea({ radiusMiles: value })} />
                <TextField label="ZIP codes" wide value={area.zipCodes} placeholder="77001, 77002" onChange={(value) => setArea({ zipCodes: value })} />
                <div className="sm:col-span-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => update((d) => ({ ...d, serviceAreas: d.serviceAreas.filter((_, i) => i !== index) }))}>
                    Remove this area
                  </Button>
                </div>
              </Section>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => update((d) => ({ ...d, serviceAreas: [...d.serviceAreas, { id: null, mode: "ZIPS", label: "", centerZip: "", radiusMiles: "", zipCodes: "" }] }))}
          >
            Add service area
          </Button>
          {draft.credentials.map((credential, index) => {
            const setCredential = (patch: Partial<typeof credential>) =>
              update((d) => ({ ...d, credentials: d.credentials.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
            return (
              <Section key={credential.id} title={`Credential: ${credential.label || "Untitled"}`} note="The uploaded document is not shown or changed here.">
                <TextField label="Label" value={credential.label} onChange={(value) => setCredential({ label: value })} />
                <SelectField label="Kind" value={credential.kind} options={CREDENTIAL_KINDS} onChange={(value) => setCredential({ kind: value })} />
                <SelectField label="Status" value={credential.status} options={CREDENTIAL_STATUSES} onChange={(value) => setCredential({ status: value })} />
                <TextField label="Expires" type="date" value={credential.expiresAt} onChange={(value) => setCredential({ expiresAt: value })} />
              </Section>
            );
          })}
          {draft.portfolio.map((photo, index) => {
            const setPhoto = (patch: Partial<typeof photo>) =>
              update((d) => ({ ...d, portfolio: d.portfolio.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
            return (
              <Section key={photo.id} title={`Portfolio photo ${index + 1}`}>
                <TextField label="Caption" wide value={photo.title} onChange={(value) => setPhoto({ title: value })} />
                <AreaField label="Description" value={photo.description} onChange={(value) => setPhoto({ description: value })} />
                <SelectField label="Photo approval" value={photo.privacyState} options={PHOTO_STATES} onChange={(value) => setPhoto({ privacyState: value })} />
              </Section>
            );
          })}
        </div>
      ) : null}
    </EditorFrame>
  );
}

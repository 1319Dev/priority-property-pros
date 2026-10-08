import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BrandLoader } from "../../../components/brand/BrandLoader";
import { ProjectTypePicker } from "../../../components/marketplace/ProjectTypePicker";
import { Button } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/Input";
import { FormError } from "../../../lib/auth/AuthCard";
import { PHOTO_UPLOAD_GUIDANCE } from "../../../lib/marketplace/photoSafety";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  fetchProject,
  fetchServiceCategories,
  fetchServiceQuestions,
  submitNewProject,
  TIMING_LABELS,
} from "../../../lib/marketplace/api";
import { PRE_HIRE_CONTACT_HINT } from "../../../lib/marketplace/antiCircumvention";
import { canPostProject } from "../../../lib/marketplace/completeness";
import { POST_BLOCKED_REASON, STREET_STAYS_PRIVATE, TARGETED_PRO_NOTE, WIZARD_PERSIST_NOTE } from "../../../lib/marketplace/customerCopy";
import { formatBudgetRange, normalizedWizardPlace, todayIsoDate, wizardStepError } from "../../../lib/marketplace/wizardValidation";
import { dollarsToCents, formatUsdFromCents } from "../../../lib/marketplace/fees";
import { photoUploadError } from "../../../lib/marketplace/flows";
import {
  TIMING_PREFERENCES,
  WIZARD_STEPS,
  type ServiceCategory,
  type ServiceQuestion,
  type TimingPreference,
} from "../../../lib/marketplace/types";
import {
  clearWizardSession,
  emptyWizardSession,
  readWizardSession,
  wizardSessionIsEmpty,
  writeWizardSession,
  type WizardSession,
} from "../../../lib/marketplace/wizardSession";

type LocalPhoto = { id: string; file: File; url: string };

export function ProjectWizardPage() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const composing = !projectId || projectId === "new";
  const [form, setForm] = useState<WizardSession>(() =>
    composing ? (readWizardSession() ?? emptyWizardSession()) : emptyWizardSession(),
  );
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [questions, setQuestions] = useState<ServiceQuestion[]>([]);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const persistReady = useRef(false);

  const step = form.step;

  useEffect(() => {
    if (!composing) {
      persistReady.current = false;
      return;
    }
    if (!persistReady.current) {
      const saved = readWizardSession();
      if (saved && !wizardSessionIsEmpty(saved)) setForm(saved);
      persistReady.current = true;
      return;
    }
    if (wizardSessionIsEmpty(form)) {
      const saved = readWizardSession();
      if (saved && !wizardSessionIsEmpty(saved)) return;
    }
    writeWizardSession(form);
  }, [composing, form]);

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.url);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!user || !profile) return;
      let redirected = false;
      try {
        const cats = await fetchServiceCategories();
        if (cancelled) return;
        setCategories(cats);
        if (!composing && projectId) {
          const row = await fetchProject(projectId);
          if (cancelled) return;
          redirected = true;
          navigate(
            row.status === "DRAFT"
              ? "/app/customer/projects/new/wizard"
              : row.status === "CONTRACTOR_SELECTED" || row.status === "CANCELLED"
                ? `/app/customer/projects/${row.id}`
                : `/app/customer/projects/${row.id}/edit`,
            { replace: true },
          );
          return;
        }
        const preset = params.get("q") ?? params.get("service") ?? params.get("trade") ?? "";
        const match = cats.find((c) => c.slug === preset || c.name.toLowerCase() === preset.toLowerCase());
        if (preset) {
          setForm((current) => {
            if (!wizardSessionIsEmpty(current)) return current;
            return {
              ...current,
              title: match ? "" : preset,
              categoryId: match?.id ?? null,
            };
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the form.");
      } finally {
        if (!cancelled && !redirected) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [composing, projectId, user, profile, navigate, params]);

  useEffect(() => {
    if (!form.categoryId) {
      setQuestions([]);
      return;
    }
    void fetchServiceQuestions(form.categoryId).then(setQuestions).catch((err: Error) => setError(err.message));
  }, [form.categoryId]);

  useEffect(() => {
    document.querySelector<HTMLElement>("[data-current='true']")?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [step]);

  function patch(next: Partial<WizardSession>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function go(next: number) {
    patch({ step: next });
  }

  function addPhoto(file: File) {
    const message = photoUploadError(file.type, file.size);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setPhotos((current) => [
      ...current,
      { id: crypto.randomUUID(), file, url: URL.createObjectURL(file) },
    ]);
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((photo) => photo.id !== id);
    });
  }

  async function onPost() {
    if (!user || !profile) return;
    setBusy(true);
    setError(null);
    try {
      const projectIdCreated = await submitNewProject({
        customerId: profile.id,
        userId: user.id,
        title: form.title,
        description: form.description,
        categoryId: form.categoryId,
        city: normalizedWizardPlace(form).city,
        state: normalizedWizardPlace(form).state,
        zipCode: form.zipCode,
        timing: form.timing,
        preferredDate: form.timing === "SPECIFIC_DATE" ? form.preferredDate : "",
        budgetMinCents: dollarsToCents(form.budgetMin),
        budgetMaxCents: dollarsToCents(form.budgetMax),
        streetLine1: form.street,
        streetLine2: form.street2,
        answers: questions.map((question) => ({
          questionId: question.id,
          answerText: form.answers[question.id] ?? "",
        })),
        photos: photos.map((photo) => photo.file),
      });
      clearWizardSession();
      navigate(`/app/customer/projects/${projectIdCreated}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return error ? <p className="text-ink-500">{error}</p> : <BrandLoader layout="section" />;
  }

  if (!composing) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl text-forest-800">This project is already posted.</h1>
        {projectId ? (
          <Link className="font-semibold text-forest-800 underline" to={`/app/customer/projects/${projectId}`}>
            Open project
          </Link>
        ) : null}
      </div>
    );
  }

  const category = categories.find((c) => c.id === form.categoryId);
  const budgetMinCents = dollarsToCents(form.budgetMin);
  const budgetMaxCents = dollarsToCents(form.budgetMax);
  const ready = canPostProject({ title: form.title, category_id: form.categoryId, zip_code: form.zipCode });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Post a project</p>
        <h1 className="font-display text-4xl font-semibold text-forest-800">
          {WIZARD_STEPS[step - 1]?.label ?? "Project"}
        </h1>
        <p className="text-sm text-ink-500">{WIZARD_PERSIST_NOTE}</p>
        {params.get("pro") ? <p className="text-sm text-ink-700">{TARGETED_PRO_NOTE}</p> : null}
        <ol className="flex flex-wrap gap-1 pb-1" aria-label="Steps">
          {WIZARD_STEPS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                data-current={item.id === step ? "true" : undefined}
                className={`min-h-11 rounded-full px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] ${
                  item.id === step ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-ink-700"
                }`}
                onClick={() => go(item.id)}
              >
                {item.id}. {item.label}
              </button>
            </li>
          ))}
        </ol>
      </header>

      <FormError message={error} />

      {step === 1 ? (
        <div className="space-y-4">
          <TextInput
            label="What do you need done?"
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Fence repaired before the weekend"
          />
          <label className="block" htmlFor="need-detail">
            <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
              A little more detail
            </span>
            <textarea
              id="need-detail"
              rows={4}
              className="w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 py-3"
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
            <span className="mt-1.5 block text-sm text-ink-500">{PRE_HIRE_CONTACT_HINT}</span>
          </label>
        </div>
      ) : null}

      {step === 2 ? (
        <ProjectTypePicker
          categories={categories}
          selectedId={form.categoryId}
          onSelect={(categoryId) => patch({ categoryId })}
        />
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            Photos stay on this page until you post. Leaving without posting does not upload them. {PHOTO_UPLOAD_GUIDANCE}
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            aria-label="Add a photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              addPhoto(file);
            }}
          />
          <ul className="grid grid-cols-2 gap-3">
            {photos.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-2xl bg-cream-100">
                <img src={photo.url} alt="Project photo" className="h-28 w-full object-cover" />
                <button
                  type="button"
                  className="w-full min-h-11 text-sm font-semibold text-danger-600"
                  onClick={() => removePhoto(photo.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          {questions.length === 0 ? <p className="text-ink-500">Pick a category first.</p> : null}
          {questions.map((question) => (
            <div key={question.id}>
              <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
                {question.prompt}
                {question.is_required ? " *" : ""}
              </p>
              {question.kind === "SINGLE_CHOICE" ? (
                <select
                  className="min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4"
                  value={form.answers[question.id] ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      answers: { ...current.answers, [question.id]: e.target.value },
                    }))
                  }
                >
                  <option value="">Select</option>
                  {question.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : question.kind === "BOOLEAN" ? (
                <select
                  className="min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4"
                  value={form.answers[question.id] ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      answers: { ...current.answers, [question.id]: e.target.value },
                    }))
                  }
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              ) : (
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 py-3"
                  value={form.answers[question.id] ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      answers: { ...current.answers, [question.id]: e.target.value },
                    }))
                  }
                />
              )}
              {question.help_text ? <p className="mt-1 text-sm text-ink-500">{question.help_text}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            {STREET_STAYS_PRIVATE} Matched pros see city and state.
          </p>
          <TextInput label="Street address" value={form.street} onChange={(e) => patch({ street: e.target.value })} autoComplete="street-address" />
          <TextInput label="Apt / unit (optional)" value={form.street2} onChange={(e) => patch({ street2: e.target.value })} />
          <TextInput label="City" value={form.city} onChange={(e) => patch({ city: e.target.value })} />
          <TextInput label="State" value={form.state} onChange={(e) => patch({ state: e.target.value })} />
          <TextInput
            label="ZIP"
            value={form.zipCode}
            onChange={(e) => patch({ zipCode: e.target.value })}
            inputMode="numeric"
          />
        </div>
      ) : null}

      {step === 6 ? (
        <div className="space-y-4">
          {TIMING_PREFERENCES.map((timing) => (
            <label key={timing} className="flex min-h-12 items-center rounded-2xl border border-forest-800/15 px-4">
              <input
                type="radio"
                name="timing"
                className="mr-3"
                checked={form.timing === timing}
                onChange={() => patch({ timing: timing as TimingPreference })}
              />
              {TIMING_LABELS[timing]}
            </label>
          ))}
          {form.timing === "SPECIFIC_DATE" ? (
            <TextInput
              label="Preferred date"
              type="date"
              min={todayIsoDate()}
              value={form.preferredDate}
              onChange={(e) => patch({ preferredDate: e.target.value })}
            />
          ) : null}
        </div>
      ) : null}

      {step === 7 ? (
        <div className="space-y-4">
          <TextInput
            label="Budget min (USD)"
            inputMode="decimal"
            value={form.budgetMin}
            onChange={(e) => patch({ budgetMin: e.target.value })}
          />
          <TextInput
            label="Budget max (USD)"
            inputMode="decimal"
            value={form.budgetMax}
            onChange={(e) => patch({ budgetMax: e.target.value })}
          />
        </div>
      ) : null}

      {step === 8 ? (
        <div className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
          <p>
            <strong>Need:</strong> {form.title || "—"}
          </p>
          <p>
            <strong>Project type:</strong> {category?.name ?? "—"}
          </p>
          <p>
            <strong>Where (approximate):</strong> {[form.city, form.state, form.zipCode].filter(Boolean).join(", ") || "—"}
          </p>
          <p>
            <strong>Street (protected):</strong> {form.street || "—"}
          </p>
          <p>
            <strong>When:</strong> {form.timing ? TIMING_LABELS[form.timing] : "—"}
          </p>
          <p>
            <strong>Budget:</strong> {formatBudgetRange(budgetMinCents, budgetMaxCents, formatUsdFromCents)}
          </p>
          <p>
            <strong>Photos:</strong> {photos.length}
          </p>
          <p className="text-ink-500">Completeness is informational. You can post with title, category, and ZIP.</p>
        </div>
      ) : null}

      <div className="sticky bottom-24 z-20 flex gap-3 bg-cream-50/95 py-3 pb-safe lg:bottom-4">
        {step > 1 ? (
          <Button type="button" variant="outline" className="min-h-14 flex-1" disabled={busy} onClick={() => go(step - 1)}>
            Back
          </Button>
        ) : null}
        {step < 8 ? (
          <Button
            type="button"
            className="min-h-14 flex-1"
            disabled={busy}
            onClick={() => {
              const message = wizardStepError(step, form, questions);
              if (message) {
                setError(message);
                return;
              }
              setError(null);
              go(step + 1);
            }}
          >
            Continue
          </Button>
        ) : (
          <div className="flex-1 space-y-2">
            {!ready ? <p className="text-sm text-ink-700">{POST_BLOCKED_REASON}</p> : null}
            <Button type="button" className="min-h-14 w-full" disabled={busy || !ready} onClick={() => void onPost()}>
              {busy ? "Posting…" : "Post project"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CompletenessBadge } from "../../../components/marketplace/CompletenessBadge";
import { Button } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/Input";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  createDraftProject,
  fetchPrivateLocation,
  fetchProject,
  fetchProjectAnswers,
  fetchProjectPhotos,
  fetchServiceCategories,
  fetchServiceQuestions,
  postProject,
  signedProjectPhotoUrl,
  TIMING_LABELS,
  updateProject,
  uploadProjectPhoto,
  upsertPrivateLocation,
  upsertProjectAnswer,
} from "../../../lib/marketplace/api";
import { canPostProject, computeCompleteness } from "../../../lib/marketplace/completeness";
import { centsToDollarString, dollarsToCents, formatUsdFromCents } from "../../../lib/marketplace/fees";
import {
  TIMING_PREFERENCES,
  WIZARD_STEPS,
  type Project,
  type ServiceCategory,
  type ServiceQuestion,
} from "../../../lib/marketplace/types";

export function ProjectWizardPage() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [questions, setQuestions] = useState<ServiceQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<{ id: string; storage_path: string; url?: string }[]>([]);
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const step = project?.draft_step ?? 1;

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!user || !profile) return;
      try {
        const cats = await fetchServiceCategories();
        if (cancelled) return;
        setCategories(cats);
        if (!projectId || projectId === "new") {
          const created = await createDraftProject(profile.id);
          const preset = params.get("q") ?? params.get("service") ?? "";
          const match = cats.find((c) => c.slug === preset || c.name.toLowerCase() === preset.toLowerCase());
          if (preset) {
            await updateProject(created.id, {
              title: match ? "" : preset,
              category_id: match?.id ?? null,
            });
          }
          navigate(`/app/customer/projects/${created.id}/wizard`, { replace: true });
          return;
        }
        const row = await fetchProject(projectId);
        const [photoRows, answerRows, loc] = await Promise.all([
          fetchProjectPhotos(projectId),
          fetchProjectAnswers(projectId),
          fetchPrivateLocation(projectId),
        ]);
        if (cancelled) return;
        setProject(row);
        setStreet(loc?.street_line1 ?? "");
        setStreet2(loc?.street_line2 ?? "");
        setBudgetMin(centsToDollarString(row.budget_min_cents));
        setBudgetMax(centsToDollarString(row.budget_max_cents));
        setAnswers(Object.fromEntries(answerRows.map((a) => [a.question_id, a.answer_text ?? ""])));
        const withUrls = await Promise.all(
          photoRows.map(async (photo) => ({
            ...photo,
            url: (await signedProjectPhotoUrl(photo.storage_path)) ?? undefined,
          })),
        );
        setPhotos(withUrls);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the wizard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [projectId, user, profile, navigate, params]);

  useEffect(() => {
    if (!project?.category_id) {
      setQuestions([]);
      return;
    }
    void fetchServiceQuestions(project.category_id).then(setQuestions).catch((err: Error) => setError(err.message));
  }, [project?.category_id]);

  const completeness = useMemo(() => {
    if (!project) return "MORE_INFO_NEEDED";
    return computeCompleteness({
      title: project.title,
      description: project.description,
      category_id: project.category_id,
      zip_code: project.zip_code,
      city: project.city,
      state: project.state,
      timing: project.timing,
      budget_min_cents: project.budget_min_cents,
      budget_max_cents: project.budget_max_cents,
      photo_count: photos.length,
      street_line1: street,
      required_questions: questions,
      answers: Object.entries(answers).map(([question_id, answer_text]) => ({ question_id, answer_text })),
    });
  }, [project, photos.length, street, questions, answers]);

  async function savePatch(patch: Parameters<typeof updateProject>[1], nextStep?: number) {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProject(project.id, {
        ...patch,
        draft_step: nextStep ?? project.draft_step,
      });
      setProject(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function go(next: number) {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      if (step === 5) {
        await upsertPrivateLocation(project.id, {
          street_line1: street,
          street_line2: street2,
          lat: null,
          lng: null,
        });
      }
      if (step === 4) {
        await Promise.all(
          questions.map((q) => upsertProjectAnswer(project.id, q.id, answers[q.id] ?? "")),
        );
      }
      const updated = await updateProject(project.id, { draft_step: next });
      setProject(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue.");
    } finally {
      setBusy(false);
    }
  }

  async function onPost() {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      await upsertPrivateLocation(project.id, {
        street_line1: street,
        street_line2: street2,
        lat: null,
        lng: null,
      });
      await postProject(project.id);
      navigate(`/app/customer/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !project) {
    return <p className="text-ink-500">{error ?? "Loading your draft…"}</p>;
  }

  if (project.status !== "DRAFT") {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl text-forest-800">This project is already posted.</h1>
        <Link className="font-semibold text-forest-800 underline" to={`/app/customer/projects/${project.id}`}>
          Open project
        </Link>
      </div>
    );
  }

  const category = categories.find((c) => c.id === project.category_id);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Post a project</p>
        <h1 className="font-display text-4xl font-semibold text-forest-800">
          {WIZARD_STEPS[step - 1]?.label ?? "Project"}
        </h1>
        <CompletenessBadge value={completeness} />
        <ol className="flex flex-wrap gap-1" aria-label="Steps">
          {WIZARD_STEPS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${
                  item.id === step ? "bg-forest-800 text-cream-50" : "text-ink-500"
                }`}
                onClick={() => void go(item.id)}
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
            value={project.title}
            onChange={(e) => setProject({ ...project, title: e.target.value })}
            onBlur={() => void savePatch({ title: project.title })}
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
              value={project.description}
              onChange={(e) => setProject({ ...project, description: e.target.value })}
              onBlur={() => void savePatch({ description: project.description })}
            />
          </label>
        </div>
      ) : null}

      {step === 2 ? (
        <fieldset className="grid grid-cols-1 gap-2">
          <legend className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
            Category
          </legend>
          {categories.map((cat) => (
            <label
              key={cat.id}
              className={`flex min-h-12 cursor-pointer items-center rounded-2xl border px-4 ${
                project.category_id === cat.id ? "border-forest-800 bg-cream-100" : "border-forest-800/15"
              }`}
            >
              <input
                type="radio"
                name="category"
                className="mr-3"
                checked={project.category_id === cat.id}
                onChange={() => {
                  setProject({ ...project, category_id: cat.id });
                  void savePatch({ category_id: cat.id });
                }}
              />
              <span>
                <span className="font-semibold text-forest-800">{cat.name}</span>
                <span className="block text-sm text-ink-500">{cat.blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-700">Photos stay private. Only you, PPP, and matched contractors can see them.</p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            aria-label="Add a photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || !user) return;
              setBusy(true);
              void uploadProjectPhoto({
                userId: user.id,
                projectId: project.id,
                file,
                sortOrder: photos.length,
              })
                .then(() => fetchProjectPhotos(project.id))
                .then(async (rows) => {
                  const withUrls = await Promise.all(
                    rows.map(async (photo) => ({
                      ...photo,
                      url: (await signedProjectPhotoUrl(photo.storage_path)) ?? undefined,
                    })),
                  );
                  setPhotos(withUrls);
                })
                .catch((err: Error) => setError(err.message))
                .finally(() => setBusy(false));
            }}
          />
          <ul className="grid grid-cols-2 gap-3">
            {photos.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-2xl bg-cream-100">
                {photo.url ? (
                  <img src={photo.url} alt="" className="h-28 w-full object-cover" />
                ) : (
                  <p className="p-4 text-sm">Photo attached</p>
                )}
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
                  value={answers[question.id] ?? ""}
                  onChange={(e) => setAnswers((current) => ({ ...current, [question.id]: e.target.value }))}
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
                  value={answers[question.id] ?? ""}
                  onChange={(e) => setAnswers((current) => ({ ...current, [question.id]: e.target.value }))}
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              ) : (
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 py-3"
                  value={answers[question.id] ?? ""}
                  onChange={(e) => setAnswers((current) => ({ ...current, [question.id]: e.target.value }))}
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
            Your exact street stays protected until you select a contractor. Matched pros only see city and ZIP.
          </p>
          <TextInput label="Street address" value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" />
          <TextInput label="Apt / unit (optional)" value={street2} onChange={(e) => setStreet2(e.target.value)} />
          <TextInput
            label="City"
            value={project.city ?? ""}
            onChange={(e) => setProject({ ...project, city: e.target.value })}
            onBlur={() => void savePatch({ city: project.city })}
          />
          <TextInput
            label="State"
            value={project.state ?? ""}
            onChange={(e) => setProject({ ...project, state: e.target.value })}
            onBlur={() => void savePatch({ state: project.state })}
          />
          <TextInput
            label="ZIP"
            value={project.zip_code ?? ""}
            onChange={(e) => setProject({ ...project, zip_code: e.target.value })}
            onBlur={() => void savePatch({ zip_code: project.zip_code })}
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
                checked={project.timing === timing}
                onChange={() => {
                  setProject({ ...project, timing });
                  void savePatch({ timing });
                }}
              />
              {TIMING_LABELS[timing]}
            </label>
          ))}
          {project.timing === "SPECIFIC_DATE" ? (
            <TextInput
              label="Preferred date"
              type="date"
              value={project.preferred_date ?? ""}
              onChange={(e) => {
                setProject({ ...project, preferred_date: e.target.value });
                void savePatch({ preferred_date: e.target.value });
              }}
            />
          ) : null}
        </div>
      ) : null}

      {step === 7 ? (
        <div className="space-y-4">
          <TextInput
            label="Budget min (USD)"
            inputMode="decimal"
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
            onBlur={() => void savePatch({ budget_min_cents: dollarsToCents(budgetMin) })}
          />
          <TextInput
            label="Budget max (USD)"
            inputMode="decimal"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            onBlur={() => void savePatch({ budget_max_cents: dollarsToCents(budgetMax) })}
          />
        </div>
      ) : null}

      {step === 8 ? (
        <div className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
          <p>
            <strong>Need:</strong> {project.title || "—"}
          </p>
          <p>
            <strong>Category:</strong> {category?.name ?? "—"}
          </p>
          <p>
            <strong>Where (approximate):</strong> {[project.city, project.state, project.zip_code].filter(Boolean).join(", ") || "—"}
          </p>
          <p>
            <strong>Street (protected):</strong> {street || "—"}
          </p>
          <p>
            <strong>When:</strong> {project.timing ? TIMING_LABELS[project.timing] : "—"}
          </p>
          <p>
            <strong>Budget:</strong>{" "}
            {project.budget_min_cents != null || project.budget_max_cents != null
              ? `${project.budget_min_cents != null ? formatUsdFromCents(project.budget_min_cents) : "—"} to ${
                  project.budget_max_cents != null ? formatUsdFromCents(project.budget_max_cents) : "—"
                }`
              : "—"}
          </p>
          <p>
            <strong>Photos:</strong> {photos.length}
          </p>
          <p className="text-ink-500">Completeness is informational. You can post with title, category, and ZIP.</p>
        </div>
      ) : null}

      <div className="flex gap-3">
        {step > 1 ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void go(step - 1)}>
            Back
          </Button>
        ) : null}
        {step < 8 ? (
          <Button type="button" disabled={busy} onClick={() => void go(step + 1)}>
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            disabled={busy || !canPostProject(project)}
            onClick={() => void onPost()}
          >
            {busy ? "Posting…" : "Post project"}
          </Button>
        )}
      </div>
    </div>
  );
}

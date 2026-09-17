import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/Input";
import { LoadingState, NotFoundState } from "../../../components/ui/PageState";
import { StatusBanner } from "../../../components/ui/StatusBanner";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  deleteProjectPhoto,
  fetchMyCustomerProject,
  fetchPrivateLocation,
  fetchProjectAnswers,
  fetchProjectPhotos,
  fetchServiceCategories,
  fetchServiceQuestions,
  signedProjectPhotoUrl,
  TIMING_LABELS,
  updateCustomerProject,
  uploadProjectPhoto,
} from "../../../lib/marketplace/api";
import { PRE_HIRE_CONTACT_HINT } from "../../../lib/marketplace/antiCircumvention";
import { classifyProjectPatch, planMaterialEdit } from "../../../lib/marketplace/lifecycle";
import { centsToDollarString, dollarsToCents } from "../../../lib/marketplace/fees";
import { TIMING_PREFERENCES, type Project, type ServiceCategory, type ServiceQuestion } from "../../../lib/marketplace/types";
import { useToast } from "../../../hooks/useToast";

export function ProjectEditPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [questions, setQuestions] = useState<ServiceQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<{ id: string; storage_path: string; url?: string }[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [timing, setTiming] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [participation, setParticipation] = useState({
    acceptedOpportunityCount: 0,
    submittedEstimateCount: 0,
    opportunityCount: 0,
  });

  async function load() {
    const row = await fetchMyCustomerProject(projectId);
    setProject(row);
    setTitle(row.title);
    setDescription(row.description);
    setCategoryId(row.category_id ?? "");
    setCity(row.city ?? "");
    setState(row.state ?? "");
    setZip(row.zip_code ?? "");
    setTiming(row.timing ?? "");
    setPreferredDate(row.preferred_date ?? "");
    setBudgetMin(centsToDollarString(row.budget_min_cents));
    setBudgetMax(centsToDollarString(row.budget_max_cents));
    const [cats, photoRows, answerRows, loc] = await Promise.all([
      fetchServiceCategories(),
      fetchProjectPhotos(projectId),
      fetchProjectAnswers(projectId),
      fetchPrivateLocation(projectId).catch(() => null),
    ]);
    setCategories(cats);
    setStreet(loc?.street_line1 ?? "");
    setStreet2(loc?.street_line2 ?? "");
    setAnswers(Object.fromEntries(answerRows.map((item) => [item.question_id, item.answer_text ?? ""])));
    setPhotos(
      await Promise.all(
        photoRows.map(async (photo) => ({
          ...photo,
          url: (await signedProjectPhotoUrl(photo.storage_path)) ?? undefined,
        })),
      ),
    );
  }

  useEffect(() => {
    void load()
      .catch(() => setMissing(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!categoryId) return;
    void fetchServiceQuestions(categoryId).then(setQuestions).catch((err: Error) => setError(err.message));
  }, [categoryId]);

  const patch = useMemo(() => {
    const next: Record<string, unknown> = {
      title,
      description,
      category_id: categoryId || null,
      city,
      state,
      zip_code: zip,
      timing: timing || null,
      preferred_date: preferredDate || null,
      budget_min_cents: dollarsToCents(budgetMin),
      budget_max_cents: dollarsToCents(budgetMax),
      street_line1: street,
      street_line2: street2,
      answers: questions.map((question) => ({ question_id: question.id, answer_text: answers[question.id] ?? "" })),
    };
    return next;
  }, [title, description, categoryId, city, state, zip, timing, preferredDate, budgetMin, budgetMax, street, street2, questions, answers]);

  const materialPlan = project
    ? planMaterialEdit({
        isOwner: profile?.id === project.customer_id,
        isAdmin: false,
        projectStatus: project.status,
        bookingStatus: null,
        participation,
        changingCategory: Boolean(categoryId && categoryId !== (project.category_id ?? "")),
      })
    : null;

  async function save(confirmMaterial = false) {
    setBusy(true);
    setError(null);
    try {
      const result = await updateCustomerProject(projectId, { ...patch, confirm_material: confirmMaterial });
      if (result.needs_confirmation) {
        setMaterialOpen(true);
        setParticipation((current) => ({ ...current, submittedEstimateCount: Math.max(current.submittedEstimateCount, 1) }));
        return;
      }
      toast.push(result.estimates_invalidated ? "Saved. Contractors will need to send new estimates." : "Project saved.");
      navigate(`/app/customer/projects/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading project" />;
  if (missing || !project) {
    return <NotFoundState title="Project not found" body="This project is not in your account." />;
  }
  if (project.status === "DRAFT") {
    return (
      <div className="space-y-4">
        <p>This is still a draft.</p>
        <ButtonLink to={`/app/customer/projects/${project.id}/wizard`}>Finish project</ButtonLink>
      </div>
    );
  }
  if (project.status === "CANCELLED" || project.status === "CONTRACTOR_SELECTED") {
    return (
      <div className="space-y-4">
        <StatusBanner
          tone="warning"
          title="Editing is not available"
          body={
            project.status === "CANCELLED"
              ? "Cancelled projects stay in your history and cannot be edited."
              : "A contractor is already selected. Cancel the pending booking first if you need to change the job."
          }
        />
        <ButtonLink to={`/app/customer/projects/${project.id}`} variant="outline">
          Back to project
        </ButtonLink>
      </div>
    );
  }

  const kind = classifyProjectPatch({
    title,
    description,
    category_id: categoryId,
    city,
    state,
    zip_code: zip,
    timing,
    answers,
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Edit project</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Update the job</h1>
        <p className="mt-3 text-sm text-ink-700">
          {kind === "material"
            ? "Changing the work itself may take current estimates off this job until those pros send a new price."
            : "Title, timing, and budget can change without replacing current estimates."}
        </p>
      </header>
      <FormError message={error} />
      <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="block">
        <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Description</span>
        <textarea className="min-h-32 w-full rounded-2xl border border-forest-800/15 px-4 py-3" value={description} onChange={(e) => setDescription(e.target.value)} />
        <span className="mt-1.5 block text-sm text-ink-500">{PRE_HIRE_CONTACT_HINT}</span>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Category</span>
        <select className="min-h-14 w-full rounded-2xl border border-forest-800/15 px-4" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </label>
      {questions.map((question) => (
        <label key={question.id} className="block">
          <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">{question.prompt}</span>
          <textarea
            className="w-full rounded-2xl border border-forest-800/15 px-4 py-3"
            value={answers[question.id] ?? ""}
            onChange={(e) => setAnswers((current) => ({ ...current, [question.id]: e.target.value }))}
          />
        </label>
      ))}
      <TextInput label="City" value={city} onChange={(e) => setCity(e.target.value)} />
      <TextInput label="State" value={state} onChange={(e) => setState(e.target.value)} />
      <TextInput label="ZIP" value={zip} inputMode="numeric" onChange={(e) => setZip(e.target.value)} />
      <TextInput label="Street" value={street} onChange={(e) => setStreet(e.target.value)} hint="Stays private until hire + job fee (payments coming soon) or an admin unlock." />
      <TextInput label="Street line 2" value={street2} onChange={(e) => setStreet2(e.target.value)} />
      <label className="block">
        <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Schedule</span>
        <select className="min-h-14 w-full rounded-2xl border border-forest-800/15 px-4" value={timing} onChange={(e) => setTiming(e.target.value)}>
          <option value="">Choose timing</option>
          {TIMING_PREFERENCES.map((item) => (
            <option key={item} value={item}>
              {TIMING_LABELS[item]}
            </option>
          ))}
        </select>
      </label>
      {timing === "SPECIFIC_DATE" ? (
        <TextInput label="Preferred date" type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
      ) : null}
      <TextInput label="Budget min (USD)" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
      <TextInput label="Budget max (USD)" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
      <section className="space-y-3">
        <h2 className="font-display text-2xl text-forest-800">Photos</h2>
        <div className="grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative">
              <img src={photo.url} alt="" className="h-28 w-full rounded-2xl object-cover" />
              <button
                type="button"
                className="absolute right-2 top-2 rounded-full bg-cream-50 px-2 py-1 text-xs font-semibold text-danger-600"
                onClick={() => void deleteProjectPhoto(photo.id, photo.storage_path).then(load).catch((err: Error) => setError(err.message))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {user ? (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Add a photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void uploadProjectPhoto({ userId: user.id, projectId, file, sortOrder: photos.length })
                .then(load)
                .catch((err: Error) => setError(err.message));
            }}
          />
        ) : null}
      </section>
      <div className="sticky bottom-24 z-20 bg-cream-50/95 py-3 pb-safe lg:bottom-4">
        <Button type="button" className="min-h-14 w-full" disabled={busy} onClick={() => void save(false)}>
          Save changes
        </Button>
      </div>
      <ButtonLink to={`/app/customer/projects/${project.id}`} variant="ghost" className="w-full">
        Cancel
      </ButtonLink>
      <ConfirmDialog
        open={materialOpen}
        title="This changes the job contractors priced"
        body={
          materialPlan && materialPlan.ok && materialPlan.effect === "invalidate_estimates"
            ? materialPlan.message
            : "Existing estimates will be marked out of date. Pros will need to send a new estimate."
        }
        confirmLabel="Save and mark estimates out of date"
        busy={busy}
        onClose={() => setMaterialOpen(false)}
        onConfirm={() => {
          setMaterialOpen(false);
          void save(true);
        }}
      />
    </div>
  );
}

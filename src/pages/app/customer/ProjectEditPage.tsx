import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { EditableProjectPhotos, type EditablePhoto } from "../../../components/marketplace/EditableProjectPhotos";
import { JobReference } from "../../../components/marketplace/JobReference";
import { QuestionAnswerField } from "../../../components/marketplace/QuestionAnswerField";
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
import { STREET_STAYS_PRIVATE } from "../../../lib/marketplace/customerCopy";
import { buildCustomerEditPatch, classifyProjectPatch, planMaterialEdit, type CustomerEditSnapshot } from "../../../lib/marketplace/lifecycle";
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
  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  const [baseline, setBaseline] = useState<CustomerEditSnapshot | null>(null);
  const [photoBusy, setPhotoBusy] = useState<null | "upload" | string>(null);
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
    const answerMap = Object.fromEntries(answerRows.map((item) => [item.question_id, item.answer_text ?? ""]));
    setAnswers(answerMap);
    const nextPhotos = await Promise.all(
      photoRows.map(async (photo) => ({
        id: photo.id,
        storage_path: photo.storage_path,
        url: (await signedProjectPhotoUrl(photo.storage_path)) ?? undefined,
      })),
    );
    setPhotos(nextPhotos);
    setBaseline({
      title: row.title,
      description: row.description,
      category_id: row.category_id,
      city: row.city,
      state: row.state,
      zip_code: row.zip_code,
      timing: row.timing,
      preferred_date: row.preferred_date,
      budget_min_cents: row.budget_min_cents,
      budget_max_cents: row.budget_max_cents,
      street_line1: loc?.street_line1 ?? "",
      street_line2: loc?.street_line2 ?? "",
      answers: answerMap,
    });
  }

  async function refreshPhotos() {
    const photoRows = await fetchProjectPhotos(projectId);
    setPhotos(
      await Promise.all(
        photoRows.map(async (photo) => ({
          id: photo.id,
          storage_path: photo.storage_path,
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
    if (!baseline) return {};
    const next: CustomerEditSnapshot = {
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
      answers,
    };
    return buildCustomerEditPatch(baseline, next);
  }, [baseline, title, description, categoryId, city, state, zip, timing, preferredDate, budgetMin, budgetMax, street, street2, answers]);

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
      if (Object.keys(patch).length === 0) {
        toast.push("Project saved.");
        navigate(`/app/customer/projects/${projectId}`);
        return;
      }
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
    return <Navigate to="/app/customer/projects/new/wizard" replace />;
  }
  if (project.status === "CANCELLED" || project.status === "CONTRACTOR_SELECTED") {
    return (
      <div className="space-y-4">
        <JobReference value={project.reference_number} />
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

  const kind = classifyProjectPatch(patch);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Edit project</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Update the job</h1>
        <JobReference value={project.reference_number} />
        <p className="mt-3 text-sm text-ink-700">
          {kind === "material"
            ? "Changing the work itself may take current estimates off this job until those pros send a new price."
            : "Title, timing, and budget can change without replacing current estimates."}
        </p>
      </header>
      <FormError message={error} />
      <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Description</span>
        <textarea className="min-h-32 w-full rounded-2xl border border-forest-800/15 px-4 py-3" value={description} onChange={(e) => setDescription(e.target.value)} />
        <span className="mt-1.5 block text-sm text-ink-500">{PRE_HIRE_CONTACT_HINT}</span>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Category</span>
        <select className="min-h-14 w-full rounded-2xl border border-forest-800/15 px-4" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </label>
      {questions.map((question) => (
        <QuestionAnswerField
          key={question.id}
          question={question}
          value={answers[question.id] ?? ""}
          onChange={(next) => setAnswers((current) => ({ ...current, [question.id]: next }))}
        />
      ))}
      <TextInput label="City" value={city} onChange={(e) => setCity(e.target.value)} />
      <TextInput label="State" value={state} onChange={(e) => setState(e.target.value)} />
      <TextInput label="ZIP" value={zip} inputMode="numeric" onChange={(e) => setZip(e.target.value)} />
      <TextInput label="Street" value={street} onChange={(e) => setStreet(e.target.value)} hint={STREET_STAYS_PRIVATE} />
      <TextInput label="Street line 2" value={street2} onChange={(e) => setStreet2(e.target.value)} />
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Schedule</span>
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
      {user ? (
        <EditableProjectPhotos
          photos={photos}
          busy={photoBusy}
          onRemove={(photo) => {
            setPhotoBusy(photo.id);
            setError(null);
            void deleteProjectPhoto(photo.id, photo.storage_path)
              .then(refreshPhotos)
              .catch((err: Error) => setError(err.message))
              .finally(() => setPhotoBusy(null));
          }}
          onAdd={(file) => {
            setPhotoBusy("upload");
            setError(null);
            void uploadProjectPhoto({ userId: user.id, projectId, file, sortOrder: photos.length })
              .then(refreshPhotos)
              .catch((err: Error) => setError(err.message))
              .finally(() => setPhotoBusy(null));
          }}
        />
      ) : null}
      <div className="sticky bottom-24 z-20 bg-cream-50/95 py-3 pb-safe lg:bottom-4">
        <Button type="button" className="min-h-14 w-full" disabled={busy || photoBusy !== null} onClick={() => void save(false)}>
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

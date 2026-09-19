import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  PROJECT_TYPE_TABS,
  categoriesForProjectTypeTab,
  projectTypeTabForSlug,
  type ProjectTypeTabId,
} from "../../lib/marketplace/serviceCategoryGroups";
import { cn } from "../../utils/cn";

export type ProjectTypeOption = {
  id: string;
  slug: string;
  name: string;
  blurb: string;
};

export type ProjectTypeTabValue = ProjectTypeTabId | "all";

const hiddenRadioStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

export function ProjectTypeTabBar({
  value,
  onChange,
  includeAll = false,
  idPrefix,
}: {
  value: ProjectTypeTabValue;
  onChange: (next: ProjectTypeTabValue) => void;
  includeAll?: boolean;
  idPrefix: string;
}) {
  const tabs = includeAll ? ([{ id: "all" as const, label: "All types" }, ...PROJECT_TYPE_TABS] as const) : PROJECT_TYPE_TABS;
  const skipScroll = useRef(true);

  useEffect(() => {
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }
    const activeTab = document.getElementById(`${idPrefix}-tab-${value}`);
    if (activeTab && typeof activeTab.scrollIntoView === "function") {
      activeTab.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [idPrefix, value]);

  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain">
      <div className="flex w-max min-w-full gap-2 pb-1" role="tablist" aria-label="Project type groups">
        {tabs.map((item) => {
          const selectedTab = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${item.id}`}
              aria-selected={selectedTab}
              aria-controls={`${idPrefix}-panel`}
              className={cn(
                "min-h-11 shrink-0 snap-start whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                selectedTab ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-forest-800 hover:bg-cream-200",
              )}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProjectTypePicker({
  categories,
  selectedId,
  onSelect,
  name = "category",
  legend = "Project type",
}: {
  categories: ProjectTypeOption[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  name?: string;
  legend?: string;
}) {
  const uid = useId();
  const selected = categories.find((category) => category.id === selectedId) ?? null;
  const [tab, setTab] = useState<ProjectTypeTabId>(() =>
    selected ? projectTypeTabForSlug(selected.slug) : PROJECT_TYPE_TABS[0].id,
  );
  const syncedSelection = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    const match = categories.find((category) => category.id === selectedId);
    if (!match || selectedId === syncedSelection.current) return;
    syncedSelection.current = selectedId;
    setTab(projectTypeTabForSlug(match.slug));
  }, [selectedId, categories]);

  const visible = useMemo(() => categoriesForProjectTypeTab(categories, tab), [categories, tab]);

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">{legend}</legend>
      {selected ? (
        <p className="text-sm text-ink-700">
          Selected: <span className="font-semibold text-forest-800">{selected.name}</span>
        </p>
      ) : (
        <p className="text-sm text-ink-500">Choose the kind of work. Switch tabs to browse types.</p>
      )}

      <ProjectTypeTabBar idPrefix={uid} value={tab} onChange={(next) => setTab(next === "all" ? tab : next)} />

      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`} className="min-w-0">
        {visible.length === 0 ? (
          <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">Nothing in this group yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {visible.map((category) => {
              const isSelected = selectedId === category.id;
              return (
                <label
                  key={category.id}
                  className={cn(
                    "relative flex min-h-20 min-w-0 cursor-pointer flex-col items-start rounded-2xl border px-3 py-3 text-left shadow-[0_1px_0_rgba(255,255,255,0.7)] transition-colors",
                    isSelected
                      ? "border-forest-800 bg-cream-100 ring-2 ring-gold-500/70"
                      : "border-forest-800/10 bg-cream-50 hover:border-gold-500 hover:bg-cream-100",
                  )}
                >
                  <input
                    type="radio"
                    name={name}
                    className="sr-only"
                    style={hiddenRadioStyle}
                    checked={isSelected}
                    onChange={() => onSelect(category.id)}
                  />
                  {isSelected ? (
                    <span className="mb-1 inline-flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-gold-700">
                      <span
                        aria-hidden
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-forest-800 font-sans text-[0.6rem] leading-none text-cream-50"
                      >
                        ✓
                      </span>
                      Selected
                    </span>
                  ) : null}
                  <span className="font-display text-base font-semibold leading-snug text-forest-800">
                    {category.name}
                  </span>
                  <span className="mt-1 line-clamp-3 text-xs leading-snug text-ink-500">{category.blurb}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </fieldset>
  );
}

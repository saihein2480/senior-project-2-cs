"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  DELIVERY_AREA_GROUPS,
  findWard,
  searchWards,
  type DeliveryArea,
} from "../lib/deliveryArea";

type WardComboboxProps = {
  id: string;
  /** Selected area name, or "" when nothing is chosen. */
  value: string;
  onChange: (ward: string) => void;
  /** Id of an element describing the field (e.g. the delivery-area notice). */
  describedBy?: string;
  invalid?: boolean;
};

/**
 * Searchable single-select for Tachileik wards and local areas
 * (ARIA 1.2 combobox with a grouped listbox).
 *
 * Typing filters by English or Myanmar name, alternate spelling, or parent
 * ward. Only an area from the list can be committed: leaving the field with
 * unmatched text restores the last valid choice, so the stored value is
 * always one of DELIVERY_AREAS.
 */
export function WardCombobox({
  id,
  value,
  onChange,
  describedBy,
  invalid,
}: WardComboboxProps) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Keep the visible text in sync when the selection changes from outside
  // (e.g. the profile finishes loading).
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // While the text equals the current selection, show the full list so the
  // customer can browse; once they edit it, filter.
  const results = query === value ? searchWards("") : searchWards(query);

  // Options grouped for display; keyboard navigation uses the flat `results`
  // order, which is already grouped (wards first, then local areas).
  const grouped = DELIVERY_AREA_GROUPS.map((group) => ({
    ...group,
    items: results
      .map((area, index) => ({ area, index }))
      .filter(({ area }) => area.kind === group.kind),
  })).filter((group) => group.items.length > 0);

  const optionId = (index: number) => `${baseId}-opt-${index}`;
  const selectedArea = findWard(value);

  // Keep the highlighted option in view during keyboard navigation.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // optionId is derived from a stable id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const openList = () => {
    setOpen(true);
    const selected = results.findIndex((a) => a.name === value);
    setActiveIndex(selected >= 0 ? selected : 0);
  };

  const commit = (area: DeliveryArea) => {
    onChange(area.name);
    setQuery(area.name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const closeAndRestore = () => {
    setOpen(false);
    setActiveIndex(-1);
    // Accept an exact typed match; otherwise fall back to the last valid area.
    const typed = findWard(query);
    if (typed && typed.name !== value) onChange(typed.name);
    setQuery(typed ? typed.name : value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const count = results.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) return openList();
        setActiveIndex((i) => (count ? (i + 1) % count : -1));
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!open) return openList();
        setActiveIndex((i) => (count ? (i <= 0 ? count - 1 : i - 1) : -1));
        return;
      case "Home":
        if (open && count) {
          e.preventDefault();
          setActiveIndex(0);
        }
        return;
      case "End":
        if (open && count) {
          e.preventDefault();
          setActiveIndex(count - 1);
        }
        return;
      case "Enter":
        if (open) {
          // Don't submit the profile form while choosing an area.
          e.preventDefault();
          const pick = results[activeIndex] || (count === 1 ? results[0] : undefined);
          if (pick) commit(pick);
        }
        return;
      case "Escape":
        if (open) {
          e.preventDefault();
          closeAndRestore();
        }
        return;
      case "Tab":
        if (open) closeAndRestore();
        return;
    }
  };

  const activeId =
    open && activeIndex >= 0 && results[activeIndex] ? optionId(activeIndex) : undefined;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        value={query}
        placeholder="Search ward or area (English / မြန်မာ)"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={openList}
        onClick={() => !open && openList()}
        onBlur={closeAndRestore}
        onKeyDown={onKeyDown}
        className={`w-full rounded-2xl border bg-white py-2.5 pl-4 pr-10 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
          invalid
            ? "border-rose-300 focus:border-rose-400 focus:ring-rose-200"
            : "border-gray-200 focus:border-rose-300 focus:ring-rose-200"
        }`}
      />

      {/* Decorative toggle; the input itself opens the list on focus/click. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) closeAndRestore();
          else {
            inputRef.current?.focus();
            openList();
          }
        }}
        className="absolute right-0 top-0 flex h-[42px] w-10 items-center justify-center text-gray-400 hover:text-rose-500"
      >
        <svg
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Myanmar name of the current choice, for customers who read Burmese. */}
      {selectedArea && !open && (
        <p className="mt-1 pl-1 text-[11px] text-gray-500">
          {selectedArea.mm}
          {selectedArea.parentWard ? ` · ${selectedArea.parentWard}` : ""}
        </p>
      )}

      <ul
        id={listboxId}
        role="listbox"
        aria-label="Tachileik wards and areas"
        hidden={!open}
        className="absolute z-20 mt-1.5 max-h-72 w-full overflow-auto rounded-2xl border border-rose-100 bg-white py-1.5 shadow-lg"
      >
        {grouped.length === 0 ? (
          <li role="presentation" className="px-4 py-2.5 text-sm text-gray-500">
            No ward or area found. We only deliver within Tachileik town.
          </li>
        ) : (
          grouped.map((group) => {
            const headerId = `${baseId}-grp-${group.kind}`;
            return (
              <li key={group.kind} role="presentation">
                <div
                  id={headerId}
                  role="presentation"
                  className="sticky top-0 bg-white/95 px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-rose-500 backdrop-blur"
                >
                  {group.label}
                </div>
                <ul role="group" aria-labelledby={headerId}>
                  {group.items.map(({ area, index }) => {
                    const selected = area.name === value;
                    const active = index === activeIndex;
                    const hint = area.parentWard ?? area.note;
                    return (
                      <li
                        key={area.name}
                        id={optionId(index)}
                        role="option"
                        aria-selected={selected}
                        // mousedown + preventDefault keeps focus in the input so
                        // blur doesn't close the list before the pick registers.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          commit(area);
                        }}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm ${
                          active ? "bg-rose-50 text-rose-700" : "text-gray-800"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className={`block ${selected ? "font-semibold" : ""}`}>
                            {area.name}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {area.mm}
                            {hint ? ` · ${hint}` : ""}
                          </span>
                        </span>
                        {selected && (
                          <svg
                            className="h-4 w-4 shrink-0 text-rose-500"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.2}
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                          </svg>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

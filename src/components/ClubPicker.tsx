"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crest } from "./Crest";
import type { CatalogResponse, Club } from "@/lib/football/types";

/** Case- and accent-insensitive match, so "munchen" finds "München". */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ClubPicker({
  open,
  onClose,
  catalog,
  loading,
  selectedIds,
  onCommit,
}: {
  open: boolean;
  onClose: () => void;
  catalog: CatalogResponse | null;
  loading: boolean;
  selectedIds: number[];
  /** Called once, with the final selection, when the sheet closes. */
  onCommit: (clubIds: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  /**
   * Ticking a checkbox edits a local draft, not the live selection. The draft
   * is handed over in one go when the sheet closes, so picking ten clubs is a
   * single update and at most one network request instead of ten.
   */
  const [draft, setDraft] = useState<number[]>(selectedIds);
  const selected = useMemo(() => new Set(draft), [draft]);

  // `key` on the rendered sheet restarts this component per opening, so the
  // draft always begins from the saved selection without an effect to sync it.
  const commitAndClose = useCallback(() => {
    onCommit(draft);
    onClose();
  }, [draft, onCommit, onClose]);

  const toggleClub = useCallback((clubId: number) => {
    setDraft((prev) =>
      prev.includes(clubId) ? prev.filter((id) => id !== clubId) : [...prev, clubId],
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") commitAndClose();
    }
    window.addEventListener("keydown", onKeyDown);
    // Stop the page behind the sheet from scrolling with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, commitAndClose]);

  const groups = useMemo(() => {
    if (!catalog) return [];
    const needle = normalise(query.trim());
    return catalog.leagues
      .map(({ league, clubs }) => ({
        league,
        clubs: needle
          ? clubs.filter(
              (club) =>
                normalise(club.name).includes(needle) ||
                normalise(club.shortName).includes(needle) ||
                normalise(club.tla).includes(needle),
            )
          : clubs,
      }))
      .filter((group) => group.clubs.length > 0);
  }, [catalog, query]);

  if (!open) return null;

  /** Adds or removes every club in one league in a single step. */
  function setLeagueSelection(clubs: Club[], shouldSelect: boolean) {
    const ids = clubs.map((club) => club.id);
    if (shouldSelect) {
      setDraft((prev) => [...new Set([...prev, ...ids])]);
    } else {
      const remove = new Set(ids);
      setDraft((prev) => prev.filter((id) => !remove.has(id)));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close club picker"
        onClick={commitAndClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose clubs"
        className="relative flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <header className="border-b border-zinc-200 px-4 pt-4 pb-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Your clubs
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {draft.length} selected
              </p>
            </div>
            <button
              type="button"
              onClick={commitAndClose}
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </div>

          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clubs…"
            className="mt-3 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading && (
            <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Loading clubs…
            </p>
          )}

          {!loading && groups.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No clubs match “{query}”.
            </p>
          )}

          {groups.map(({ league, clubs }) => {
            const allSelected = clubs.every((club) => selected.has(club.id));
            return (
              <section key={league.code}>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-y border-zinc-200/70 bg-zinc-50/95 px-4 py-1.5 backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-900/95">
                  <span className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    {/* An accent dot rather than a flag emoji: England's renders
                        as a blank black flag on Windows. */}
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: league.accent }}
                    />
                    {league.name}
                    <span className="font-normal text-zinc-400 dark:text-zinc-500">
                      {league.country}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setLeagueSelection(clubs, !allSelected)}
                    className="rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    {allSelected ? "Clear league" : "Select all"}
                  </button>
                </div>

                <ul className="px-2 py-1">
                  {clubs.map((club) => {
                    const isSelected = selected.has(club.id);
                    return (
                      <li key={club.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleClub(club.id)}
                            className="size-4 shrink-0 accent-emerald-600"
                          />
                          <Crest
                            crest={club.crest}
                            tla={club.tla}
                            accent={league.accent}
                            size={20}
                          />
                          <span
                            className={`min-w-0 flex-1 truncate text-sm ${
                              isSelected
                                ? "font-medium text-zinc-900 dark:text-zinc-50"
                                : "text-zinc-600 dark:text-zinc-400"
                            }`}
                          >
                            {club.shortName}
                          </span>
                          {/* The crest fallback already shows the TLA, so only
                              repeat it here when a real crest is displayed. */}
                          {club.crest && (
                            <span className="shrink-0 font-mono text-[0.625rem] text-zinc-400 dark:text-zinc-600">
                              {club.tla}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setDraft([])}
            disabled={draft.length === 0}
            className="rounded-md px-2.5 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={commitAndClose}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

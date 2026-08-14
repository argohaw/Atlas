import { useEffect, useMemo, useState } from "react";
import type { DocFile } from "../types";

interface SearchResult {
  file: DocFile;
  excerpt: string;
}

const cache = new Map<string, string>();

export function useSearch(files: DocFile[]) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (files.length === 0) return;
    Promise.all(
      files.map((f) => {
        if (cache.has(f.slug)) return Promise.resolve([f.slug, cache.get(f.slug)!] as const);
        return fetch(`${import.meta.env.BASE_URL}files/${f.slug}.md`)
          .then((r) => r.text())
          .then((text) => { cache.set(f.slug, text); return [f.slug, text] as const; });
      })
    ).then((entries) => setIndex(new Map(entries)));
  }, [files]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return files
      .filter((f) => {
        const content = index.get(f.slug) ?? "";
        return (
          f.label.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)) ||
          f.group.toLowerCase().includes(q) ||
          content.toLowerCase().includes(q)
        );
      })
      .map((f) => {
        const content = index.get(f.slug) ?? "";
        const idx = content.toLowerCase().indexOf(q);
        const excerpt =
          idx !== -1
            ? "…" + content.slice(Math.max(0, idx - 40), idx + 80).replace(/\n/g, " ") + "…"
            : f.tags.length ? `Tags: ${f.tags.join(", ")}` : f.label;
        return { file: f, excerpt };
      })
      .slice(0, 8);
  }, [query, files, index]);

  return { query, setQuery, results };
}

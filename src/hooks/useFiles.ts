import { useEffect, useState } from "react";
import type { DocFile, DocGroup } from "../types";

function toLabel(filename: string): string {
  return filename
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ManifestEntry {
  name: string;
  slug: string;
  group: string;
  tags: string[];
}

export function useFiles() {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [groups, setGroups] = useState<DocGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}files/files.json`)
      .then((r) => r.json())
      .then((entries: ManifestEntry[]) => {
        const parsed: DocFile[] = entries.map((e) => ({
          name: e.name,
          slug: e.slug,
          label: toLabel(e.name),
          group: e.group,
          tags: e.tags ?? [],
        }));

        // Build groups — root files first, then alphabetical folders
        const groupMap = new Map<string, DocFile[]>();
        for (const f of parsed) {
          const key = f.group || "";
          if (!groupMap.has(key)) groupMap.set(key, []);
          groupMap.get(key)!.push(f);
        }

        const built: DocGroup[] = [];
        // Root files first
        if (groupMap.has("")) {
          built.push({ name: "", label: "Documents", files: groupMap.get("")! });
        }
        // Then folders sorted
        for (const [name, groupFiles] of [...groupMap.entries()].filter(([k]) => k !== "").sort()) {
          built.push({ name, label: toLabel(name), files: groupFiles });
        }

        setFiles(parsed);
        setGroups(built);
      })
      .finally(() => setLoading(false));
  }, []);

  return { files, groups, loading };
}

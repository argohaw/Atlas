import { useEffect, useState } from "react";
import type { DocFile } from "../types";

function toLabel(filename: string): string {
  return filename
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useFiles() {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}files/files.json`)
      .then((r) => r.json())
      .then((names: string[]) =>
        setFiles(
          names.map((name) => ({
            name,
            slug: name.replace(/\.md$/, ""),
            label: toLabel(name),
          }))
        )
      )
      .finally(() => setLoading(false));
  }, []);

  return { files, loading };
}

export interface DocFile {
  name: string;       // filename e.g. "getting-started.md"
  slug: string;       // "group/filename" or "filename" for root
  label: string;      // human-readable title
  group: string;      // "" for root, folder name for grouped
  tags: string[];     // from frontmatter tags: [...]
}

export interface DocGroup {
  name: string;       // "" = root (ungrouped)
  label: string;      // display name
  files: DocFile[];
}

# Architecture Overview

This document describes the technical architecture of the Atlas markdown viewer.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Routing | React Router v6 |
| Markdown | react-markdown + remark-gfm |
| Syntax Highlighting | rehype-highlight |
| Deployment | GitHub Pages via Actions |

---

## Project Structure

```
md-viewer/
├── public/
│   └── files/          # ← Drop your .md files here
├── src/
│   ├── components/
│   │   ├── Sidebar.tsx       # Desktop navigation
│   │   ├── MobileNav.tsx     # Mobile drawer
│   │   ├── MarkdownViewer.tsx # Renders markdown
│   │   └── FileList.tsx      # File list items
│   ├── hooks/
│   │   └── useFiles.ts       # Fetches file manifest
│   ├── types/
│   │   └── index.ts          # Shared TypeScript types
│   ├── App.tsx
│   └── main.tsx
└── .github/
    └── workflows/
        └── deploy.yml        # CI/CD pipeline
```

---

## Data Flow

```
files.json (manifest)
      │
      ▼
useFiles() hook
      │
      ▼
App.tsx (routing)
      │
      ├──▶ Sidebar (desktop)
      ├──▶ MobileNav (mobile)
      └──▶ MarkdownViewer
                │
                ▼
          fetch(file.md)
                │
                ▼
         react-markdown
```

---

## File Discovery

Atlas uses a static `files.json` manifest in `public/files/` to know which markdown files exist. This is required because browsers cannot list directory contents.

```json
[
  "getting-started.md",
  "markdown-cheatsheet.md",
  "architecture.md"
]
```

The GitHub Actions workflow automatically regenerates this manifest on every push.

---

## Deployment

The project is deployed to GitHub Pages using a GitHub Actions workflow that:

1. Checks out the code
2. Installs dependencies
3. Generates `files.json` manifest
4. Builds the Vite project
5. Deploys the `dist/` folder to the `gh-pages` branch

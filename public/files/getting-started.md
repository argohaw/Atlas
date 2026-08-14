---
tags: [guide, setup]
---
# Getting Started

Welcome to **Atlas** — a clean, fast markdown viewer built with React and TypeScript.

## What is Atlas?

Atlas is a minimal, beautiful markdown viewer inspired by the design principles of Google and Netflix. Drop your `.md` files into the `files/` folder and they appear instantly in the sidebar.

## Features

- 📄 Instant markdown rendering
- 🎨 Clean, modern UI
- 📱 Fully responsive (sidebar on desktop, drawer on mobile)
- 🔗 GitHub Flavored Markdown (GFM) support
- 💡 Syntax highlighted code blocks

## Quick Start

```bash
# Clone the repository
git clone https://github.com/argohaw/Atlas.git

# Install dependencies
npm install

# Start the dev server
npm run dev
```

## Adding Your Files

Simply place any `.md` file inside the `public/files/` directory. Atlas will automatically pick it up and display it in the navigation.

> **Tip:** Files are listed alphabetically. Prefix filenames with numbers (e.g. `01-intro.md`) to control ordering.

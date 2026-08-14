import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { DocFile } from "../types";
import AtlasLogo from "./AtlasLogo";
import SearchBar from "./SearchBar";
import { useTheme } from "../context/ThemeContext";
import "./MobileNav.css";

interface Props {
  files: DocFile[];
  currentLabel?: string;
  query: string;
  setQuery: (q: string) => void;
  results: { file: DocFile; excerpt: string }[];
}

export default function MobileNav({ files, currentLabel, query, setQuery, results }: Props) {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <>
      <header className="mobile-header">
        <button className="mobile-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        <div className="mobile-brand">
          <AtlasLogo size={26} />
          <span className="mobile-logo-name">Atlas</span>
          {currentLabel && <span className="mobile-current">/ {currentLabel}</span>}
        </div>

        <button className="mobile-theme-btn" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </header>

      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <nav className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-brand">
                <AtlasLogo size={28} />
                <div className="drawer-brand-text">
                  <span className="drawer-logo-name">Atlas</span>
                  <span className="drawer-logo-tag">Docs</span>
                </div>
              </div>
              <button className="drawer-close" onClick={() => setOpen(false)} aria-label="Close menu">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="drawer-search">
              <SearchBar query={query} setQuery={setQuery} results={results} onClose={() => setOpen(false)} />
            </div>

            <div className="drawer-links">
              <p className="drawer-section-label">Documents</p>
              {files.map((f) => (
                <NavLink
                  key={f.slug}
                  to={`/doc/${f.slug}`}
                  className={({ isActive }) => `drawer-link${isActive ? " active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {f.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

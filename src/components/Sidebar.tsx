import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { DocFile, DocGroup } from "../types";
import AtlasLogo from "./AtlasLogo";
import ShinyText from "./ShinyText";
import SpotlightCard from "./SpotlightCard";
import SearchBar from "./SearchBar";
import { useTheme } from "../context/ThemeContext";
import "./Sidebar.css";

interface Props {
  groups: DocGroup[];
  query: string;
  setQuery: (q: string) => void;
  results: { file: DocFile; excerpt: string }[];
}

function FileLink({ f }: { f: DocFile }) {
  return (
    <NavLink
      to={`/doc/${f.slug}`}
      className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
    >
      {({ isActive }) => (
        <SpotlightCard
          className="sidebar-link-inner"
          spotColor={isActive ? "rgba(66,133,244,0.1)" : "rgba(255,255,255,0.04)"}
        >
          <svg className="sidebar-link-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span className="sidebar-link-label">{f.label}</span>
          {f.tags.length > 0 && (
            <span className="sidebar-link-tag">{f.tags[0]}</span>
          )}
        </SpotlightCard>
      )}
    </NavLink>
  );
}

function GroupSection({ group }: { group: DocGroup }) {
  const [open, setOpen] = useState(false);
  const isFolder = group.name !== "";

  return (
    <div className="sidebar-group">
      {isFolder ? (
        <button className="sidebar-group-header" onClick={() => setOpen((o) => !o)}>
          <svg className={`sidebar-group-chevron${open ? " open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span>{group.label}</span>
          <span className="sidebar-group-count">{group.files.length}</span>
        </button>
      ) : (
        <p className="sidebar-section-label">{group.label}</p>
      )}

      {open && (
        <div className={isFolder ? "sidebar-group-files" : ""}>
          {group.files.map((f) => <FileLink key={f.slug} f={f} />)}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ groups, query, setQuery, results }: Props) {
  const { theme, toggle } = useTheme();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <AtlasLogo size={30} />
          <div className="sidebar-brand-text">
            <ShinyText text="Atlas" className="sidebar-logo-name" />
            <span className="sidebar-logo-tag">Docs</span>
          </div>
        </div>
        <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme" title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
          {theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </div>

      <div className="sidebar-search">
        <SearchBar query={query} setQuery={setQuery} results={results} />
      </div>

      <nav className="sidebar-nav">
        {groups.map((g) => <GroupSection key={g.name || "__root__"} group={g} />)}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-footer-text">Atlas {__APP_VERSION__}</span>
      </div>
    </aside>
  );
}

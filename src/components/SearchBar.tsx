import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedBorder from "./AnimatedBorder";
import type { DocFile } from "../types";
import "./SearchBar.css";

interface SearchResult {
  file: DocFile;
  excerpt: string;
}

interface Props {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResult[];
  onClose?: () => void;
}

export default function SearchBar({ query, setQuery, results, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") { setQuery(""); onClose?.(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setQuery, onClose]);

  function pick(slug: string) {
    navigate(`/doc/${slug}`);
    setQuery("");
    onClose?.();
  }

  return (
    <div className="search-wrap">
      <AnimatedBorder active={focused && query.length > 0}>
        <div className="search-input-row">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Search… (Ctrl+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="Search documents"
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery("")} aria-label="Clear">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </AnimatedBorder>

      {results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.map(({ file, excerpt }) => (
            <li key={file.slug} role="option">
              <button className="search-result-btn" onClick={() => pick(file.slug)}>
                <span className="search-result-title">{file.label}</span>
                <span className="search-result-excerpt">{excerpt}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.length >= 2 && results.length === 0 && (
        <div className="search-empty">No results for "{query}"</div>
      )}
    </div>
  );
}

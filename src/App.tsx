import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import MobileNav from "./components/MobileNav";
import MarkdownViewer from "./components/MarkdownViewer";
import { useFiles } from "./hooks/useFiles";
import { useSearch } from "./hooks/useSearch";
import "./App.css";

function DocPage() {
  const { slug } = useParams<{ slug: string }>();
  return <MarkdownViewer slug={slug ?? ""} key={slug} />;
}

export default function App() {
  const { files, loading } = useFiles();
  const { query, setQuery, results } = useSearch(files);
  const firstSlug = files[0]?.slug;

  const searchProps = { query, setQuery, results };

  return (
    <div className="app">
      <div className="desktop-only">
        <Sidebar files={files} {...searchProps} />
      </div>

      <div className="main-area">
        <div className="mobile-only">
          <MobileNav files={files} {...searchProps} />
        </div>

        <div className="content">
          {loading ? (
            <div className="app-loading">
              <div className="spinner-lg" />
            </div>
          ) : (
            <Routes>
              <Route
                path="/"
                element={
                  firstSlug
                    ? <Navigate to={`/doc/${firstSlug}`} replace />
                    : <div className="empty-state">No documents found.</div>
                }
              />
              <Route path="/doc/:slug" element={<DocPage />} />
            </Routes>
          )}
        </div>
      </div>
    </div>
  );
}

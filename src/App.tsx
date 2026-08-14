import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import MobileNav from "./components/MobileNav";
import MarkdownViewer from "./components/MarkdownViewer";
import { useFiles } from "./hooks/useFiles";
import { useSearch } from "./hooks/useSearch";
import "./App.css";

function DocPage({ files }: { files: ReturnType<typeof useFiles>["files"] }) {
  const { "*": slug } = useParams();
  const file = files.find((f) => f.slug === slug);
  return <MarkdownViewer slug={slug ?? ""} tags={file?.tags} key={slug} />;
}

export default function App() {
  const { files, groups, loading } = useFiles();
  const { query, setQuery, results } = useSearch(files);
  const searchProps = { query, setQuery, results };

  return (
    <div className="app">
      <div className="desktop-only">
        <Sidebar groups={groups} {...searchProps} />
      </div>

      <div className="main-area">
        <div className="mobile-only">
          <MobileNav groups={groups} {...searchProps} />
        </div>

        <div className="content">
          {loading ? (
            <div className="app-loading"><div className="spinner-lg" /></div>
          ) : (
            <Routes>
              <Route
                path="/"
                element={<Navigate to="/doc/getting-started" replace />}
              />
              <Route path="/doc/*" element={<DocPage files={files} />} />
            </Routes>
          )}
        </div>
      </div>
    </div>
  );
}

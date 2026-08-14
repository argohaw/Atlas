import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import { useTheme } from "../context/ThemeContext";
import "./MarkdownViewer.css";

interface Props { slug: string; }

export default function MarkdownViewer({ slug }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`${import.meta.env.BASE_URL}files/${slug}.md`)
      .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then(setContent)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="viewer-state"><div className="spinner" /></div>;
  if (error)   return <div className="viewer-state"><p className="viewer-error">Document not found.</p></div>;

  return (
    <article className="markdown-body" data-theme-mode={theme}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeSlug]}>
        {content}
      </ReactMarkdown>
    </article>
  );
}

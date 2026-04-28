import { useMemo } from 'react';

// HTML-escape every interpolated text node. Without this, a description
// like "<img src=x onerror=alert(1)>" written by an admin (or pasted in
// from a doc) would execute when rendered via dangerouslySetInnerHTML.
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Allow only http/https and protocol-relative URLs in <a href>. Blocks
// javascript:, data:, vbscript:, etc.
const safeUrl = (url) => {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "#";
  if (/^https?:\/\//i.test(trimmed)) return escapeHtml(trimmed);
  if (trimmed.startsWith("/")) return escapeHtml(trimmed);
  return "#";
};

const renderInline = (child) => {
  if (!child) return "";
  if (child.type === "link") {
    const inner = escapeHtml(child.text || "");
    return `<a href="${safeUrl(child.url)}" rel="noopener noreferrer" target="_blank">${inner}</a>`;
  }
  let text = escapeHtml(child.text || "");
  if (child.bold) text = `<strong>${text}</strong>`;
  if (child.italic) text = `<em>${text}</em>`;
  if (child.underline) text = `<u>${text}</u>`;
  if (child.strikethrough) text = `<s>${text}</s>`;
  if (child.code) text = `<code>${text}</code>`;
  return text;
};

const renderBlock = (block) => {
  if (!block) return "";
  if (block.type === "paragraph" && Array.isArray(block.children)) {
    return `<p>${block.children.map(renderInline).join("")}</p>`;
  }
  if (block.type === "heading" && Array.isArray(block.children)) {
    const level = Math.min(Math.max(Number(block.level) || 1, 1), 6);
    return `<h${level}>${block.children.map(renderInline).join("")}</h${level}>`;
  }
  if (block.type === "list" && Array.isArray(block.children)) {
    const tag = block.format === "ordered" ? "ol" : "ul";
    const items = block.children
      .map((item) => {
        if (item?.type === "list-item" && Array.isArray(item.children)) {
          return `<li>${item.children.map(renderInline).join("")}</li>`;
        }
        return "";
      })
      .join("");
    return `<${tag}>${items}</${tag}>`;
  }
  return "";
};

const RichTextRenderer = ({ content, className = "" }) => {
  const htmlContent = useMemo(() => {
    if (!content) return "";

    // Plain string: treat as text and escape. We intentionally do NOT
    // pass through HTML strings the way the previous version did — that
    // path let any admin (or anyone with the admin cookie) inject
    // arbitrary <script> via a project description.
    if (typeof content === "string") {
      return `<p>${escapeHtml(content)}</p>`;
    }

    if (Array.isArray(content)) {
      return content.map(renderBlock).join("");
    }

    return "";
  }, [content]);

  return (
    <div
      className={`prose prose-sm max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
      style={{ whiteSpace: "pre-wrap" }}
    />
  );
};

export default RichTextRenderer;

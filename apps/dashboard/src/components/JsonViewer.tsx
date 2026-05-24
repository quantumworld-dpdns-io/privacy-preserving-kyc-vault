import { useMemo } from "react";
import { clsx } from "clsx";

interface JsonViewerProps {
  data: unknown;
  collapsed?: boolean;
  maxDepth?: number;
}

function formatValue(val: unknown, depth: number, maxDepth: number): string {
  if (depth > maxDepth) return "...";
  if (val === null) return "null";
  if (typeof val === "string") return `"${val}"`;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    return `[${val.map((v) => formatValue(v, depth + 1, maxDepth)).join(", ")}]`;
  }
  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return `{ ${entries.map(([k, v]) => `${k}: ${formatValue(v, depth + 1, maxDepth)}`).join(", ")} }`;
  }
  return String(val);
}

export default function JsonViewer({ data, collapsed = false, maxDepth = 4 }: JsonViewerProps) {
  const formatted = useMemo(() => JSON.stringify(data, null, 2), [data]);

  if (collapsed) {
    return (
      <span className="text-sm text-gray-400 font-mono">
        {formatValue(data, 0, maxDepth)}
      </span>
    );
  }

  const lines = formatted.split("\n");

  return (
    <pre className="bg-gray-950 rounded-lg border border-gray-800 p-4 overflow-x-auto text-sm leading-relaxed">
      <code>
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="text-gray-700 text-xs w-8 text-right select-none shrink-0 mr-3">
              {i + 1}
            </span>
            <SyntaxLine line={line} />
          </div>
        ))}
      </code>
    </pre>
  );
}

function SyntaxLine({ line }: { line: string }) {
  const parts: { text: string; className: string }[] = [];
  let remaining = line;

  const tokenPatterns: [RegExp, string][] = [
    [/"([^"\\]|\\.)*"/g, "text-green-400"],
    [/\b(true|false|null)\b/g, "text-blue-400"],
    [/\b-?\d+(\.\d+)?([eE][+-]?\d+)?\b/g, "text-yellow-400"],
    [/"([^"\\]|\\.)*"(?=\s*:)/g, "text-blue-300"],
    [/[{}\[\],:]/g, "text-gray-500"],
  ];

  const matches: { index: number; end: number; text: string; className: string }[] = [];

  for (const [regex, className] of tokenPatterns) {
    let match: RegExpExecArray | null;
    const re = new RegExp(regex.source, "g");
    while ((match = re.exec(remaining)) !== null) {
      matches.push({ index: match.index, end: match.index + match[0].length, text: match[0], className });
    }
  }

  matches.sort((a, b) => a.index - b.index);

  if (matches.length === 0) {
    return <span className="text-gray-500">{line}</span>;
  }

  let cursor = 0;
  for (const m of matches) {
    if (m.index < cursor) continue;
    if (m.index > cursor) {
      parts.push({ text: line.slice(cursor, m.index), className: "text-gray-300" });
    }
    parts.push({ text: m.text, className: m.className });
    cursor = m.end;
  }
  if (cursor < line.length) {
    parts.push({ text: line.slice(cursor), className: "text-gray-300" });
  }

  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={p.className}>{p.text}</span>
      ))}
    </>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Block =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "p"; text: string }
  | { type: "quote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function isOwnerDecision(text: string): boolean {
  return text.includes("[OWNER DECISION:");
}

function safeUrl(value: string): boolean {
  return value.startsWith("/") || value.startsWith("mailto:") || value.startsWith("https://") || value.startsWith("http://");
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    if (match[1]) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${index}`} className="font-semibold text-forest-800">
          {match[1]}
        </strong>,
      );
    } else if (match[2] && match[3] && safeUrl(match[3])) {
      const className = "font-semibold text-forest-800 underline";
      nodes.push(
        match[3].startsWith("/") ? (
          <Link key={`${keyPrefix}-a-${index}`} to={match[3]} className={className}>
            {match[2]}
          </Link>
        ) : (
          <a key={`${keyPrefix}-a-${index}`} href={match[3]} className={className}>
            {match[2]}
          </a>
        ),
      );
    } else {
      nodes.push(match[0]);
    }
    last = start + match[0].length;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "h", level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith("> ")) {
        quote.push(lines[index].slice(2).trim());
        index += 1;
      }
      blocks.push({ type: "quote", text: quote.join(" ") });
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith("- ")) {
        items.push(lines[index].slice(2).trim());
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, "").trim());
        index += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|>\s|-\s|\d+\.\s)/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "p", text: paragraph.join(" ") });
  }

  return blocks;
}

function decisionClass(text: string, base: string): string {
  if (!isOwnerDecision(text)) return base;
  return "rounded-3xl border border-gold-500/50 bg-gold-500/15 px-5 py-4 text-sm leading-relaxed text-forest-950";
}

export function LegalMarkdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <article className="space-y-4">
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        if (block.type === "h") {
          if (block.level === 1) {
            return (
              <h1 key={key} className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">
                {block.text}
              </h1>
            );
          }
          if (block.level === 2) {
            return (
              <h2 key={key} className="pt-6 font-display text-2xl text-forest-800 sm:text-3xl">
                {block.text}
              </h2>
            );
          }
          return (
            <h3 key={key} className="pt-2 font-display text-xl text-forest-800">
              {block.text}
            </h3>
          );
        }
        if (block.type === "quote") {
          return (
            <p key={key} className="rounded-3xl border border-gold-500/40 bg-cream-100 px-5 py-4 text-sm leading-relaxed text-ink-700">
              {inline(block.text, key)}
            </p>
          );
        }
        if (block.type === "ul" || block.type === "ol") {
          const List = block.type === "ul" ? "ul" : "ol";
          return (
            <List
              key={key}
              className={`space-y-3 pl-5 text-sm leading-relaxed text-ink-700 ${block.type === "ul" ? "list-disc" : "list-decimal"}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} className={decisionClass(item, "")}>
                  {inline(item, `${key}-${itemIndex}`)}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={key} className={decisionClass(block.text, "text-sm leading-relaxed text-ink-700 sm:text-base")}>
            {inline(block.text, key)}
          </p>
        );
      })}
    </article>
  );
}

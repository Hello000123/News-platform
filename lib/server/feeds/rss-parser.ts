interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: (XmlElement | string)[];
}

export interface FeedItem {
  readonly title: string;
  readonly url: string;
  readonly description: string | null;
  readonly author: string | null;
  readonly pubDate: number | null;
}

const ENTITY_DECODE_PATTERN = /&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/giu;

function decodeXmlEntities(value: string): string {
  return value.replace(
    ENTITY_DECODE_PATTERN,
    (entity, decimal, hex, named) => {
      if (decimal) return safeCodePoint(Number.parseInt(decimal, 10), entity);
      if (hex) return safeCodePoint(Number.parseInt(hex, 16), entity);
      if (named === "amp") return "&";
      if (named === "lt") return "<";
      if (named === "gt") return ">";
      if (named === "quot") return '"';
      if (named === "apos") return "'";
      return entity;
    },
  );
}

function safeCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

function isWhitespace(value: string) {
  return /^\s*$/u.test(value);
}

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

export function parseFeedXml(xml: string): FeedItem[] {
  const root = parseXmlDocument(xml);
  const rootName = root.name.toLowerCase();

  if (rootName === "feed") return parseAtomEntries(root);
  if (rootName === "rss" || rootName === "rdf") return parseRssItems(root);
  if (rootName === "opml") return parseOpmlOutlines(root);

  throw new FeedParseError("Unrecognised feed format.");
}

function parseRssItems(root: XmlElement): FeedItem[] {
  const channel = findChild(root, "channel");
  if (!channel) throw new FeedParseError("RSS feed has no channel element.");

  return childElements(channel)
    .filter((element) => element.name.toLowerCase() === "item")
    .map((item) => {
      const title = textOf(item, "title") ?? "";
      const link = resolveUrl(textOf(item, "link") ?? "", root);
      const description = textOf(item, "description");
      const author = textOf(item, "author") ?? textOf(item, "dc:creator");
      const pubDate = parseDate(textOf(item, "pubDate") ?? textOf(item, "dc:date"));

      if (!title.trim() || !link) {
        return null;
      }

      const itemDescription = description ? normalizePreview(description) : null;
      return {
        title: title.trim().slice(0, 1_000),
        url: link,
        description: itemDescription?.slice(0, 20_000) ?? null,
        author: author?.trim().slice(0, 500) || null,
        pubDate,
      };
    })
    .filter((item): item is FeedItem => item !== null);
}

function parseAtomEntries(root: XmlElement): FeedItem[] {
  const defaultAuthor = textOf(root, "author") ?? null;

  return childElements(root)
    .filter((element) => element.name.toLowerCase() === "entry")
    .map((entry) => {
      const title = textOf(entry, "title") ?? "";
      const link = resolveUrl(linkHref(entry), root);
      const description = textOf(entry, "summary") ?? textOf(entry, "content");
      const author = textOf(entry, "author") ?? defaultAuthor;
      const pubDate = parseDate(textOf(entry, "published") ?? textOf(entry, "updated"));

      if (!title.trim() || !link) {
        return null;
      }

      const itemDescription = description ? normalizePreview(description) : null;
      return {
        title: title.trim().slice(0, 1_000),
        url: link,
        description: itemDescription?.slice(0, 20_000) ?? null,
        author: author?.trim().slice(0, 500) || null,
        pubDate,
      };
    })
    .filter((item): item is FeedItem => item !== null);
}

function parseOpmlOutlines(root: XmlElement): FeedItem[] {
  const items: FeedItem[] = [];
  const visit = (element: XmlElement) => {
    for (const child of childElements(element)) {
      if (child.name.toLowerCase() !== "outline") continue;
      const type = child.attributes.type ?? child.attributes["xmlUrl"] ? "rss" : "";
      const title =
        child.attributes.title ??
        child.attributes.text ??
        child.attributes.xmlUrl ??
        "";
      const url = resolveUrl(child.attributes.xmlUrl ?? "", root);
      if (type.toLowerCase() === "rss" && url) {
        items.push({
          title: title.trim().slice(0, 1_000),
          url,
          description: child.attributes.description ?? null,
          author: null,
          pubDate: null,
        });
      }
      if (childElements(child).length > 0) visit(child);
    }
  };
  visit(root);
  return items;
}

function resolveUrl(rawUrl: string, root: XmlElement): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const xmlBase = root.attributes["xml:base"];
    const base = xmlBase?.trim() ? new URL(xmlBase) : undefined;
    return base ? new URL(trimmed, base).href : new URL(trimmed).href;
  } catch {
    return null;
  }
}

function linkHref(entry: XmlElement): string {
  for (const child of childElements(entry)) {
    if (child.name.toLowerCase() !== "link") continue;
    const rel = (child.attributes.rel ?? "alternate").toLowerCase();
    const href = child.attributes.href;
    if (rel === "alternate" && href) return href;
  }
  for (const child of childElements(entry)) {
    if (child.name.toLowerCase() === "link" && child.attributes.href) {
      return child.attributes.href;
    }
  }
  return "";
}

function textOf(element: XmlElement, name: string): string | null {
  const child = childElements(element).find(
    (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
  );
  if (!child) return null;
  const raw = textContent(child);
  if (name.toLowerCase() === "author") {
    return textOf(child, "name") ?? raw;
  }
  return raw;
}

function childElements(element: XmlElement): XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement => typeof child !== "string",
  );
}

function findChild(element: XmlElement, name: string): XmlElement | null {
  return childElements(element).find(
    (child) => child.name.toLowerCase() === name.toLowerCase(),
  ) ?? null;
}

function textContent(element: XmlElement): string {
  let result = "";
  for (const child of element.children) {
    if (typeof child === "string") {
      result += child;
    } else {
      result += textContent(child);
    }
  }
  return result.trim();
}

function normalizePreview(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function parseDate(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const timestamp = Date.parse(raw.trim());
  if (!Number.isFinite(timestamp)) return null;
  const seconds = Math.floor(timestamp / 1_000);
  return seconds < 0 ? null : seconds;
}

function parseXmlDocument(xml: string): XmlElement {
  const root: XmlElement = { name: "root", attributes: {}, children: [] };
  const stack: XmlElement[] = [root];
  const tokenPattern =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[^>]*\?>|<![^>]*>|<\/?[^>]+>|[^<]+/gu;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(xml)) !== null) {
    const token = match[0];
    if (token.startsWith("<!--")) continue;
    if (token.startsWith("<![CDATA[")) {
      stack.at(-1)?.children.push(token.slice(9, -3));
      continue;
    }
    if (token.startsWith("<!")) continue;
    if (token.startsWith("<?")) continue;
    if (!token.startsWith("<")) {
      if (!isWhitespace(token)) stack.at(-1)?.children.push(decodeXmlEntities(token));
      continue;
    }
    if (/^<\s*\//u.test(token)) {
      const name = token.match(/^<\s*\/\s*([^\s/>]+)/u)?.[1];
      if (name) popTo(stack, name.toLowerCase());
      continue;
    }
    const opening = token.match(/^<\s*([^\s/>]+)([^>]*)>/u);
    if (!opening) continue;
    const name = opening[1];
    const selfClosing = /\/\s*>$/u.test(token);
    const element: XmlElement = {
      name,
      attributes: parseAttributes(opening[2] ?? ""),
      children: [],
    };
    stack.at(-1)?.children.push(element);
    if (!selfClosing) stack.push(element);
  }

  const documentRoot = stack[0].children.find(
    (child): child is XmlElement => typeof child !== "string",
  );
  if (!documentRoot) throw new FeedParseError("Feed contains no XML elements.");
  return documentRoot;
}

function popTo(stack: XmlElement[], name: string) {
  for (let index = stack.length - 1; index > 0; index -= 1) {
    if (stack[index].name.toLowerCase() === name) {
      stack.length = index;
      return;
    }
  }
}

function parseAttributes(source: string): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const rawName = match[1];
    if (!rawName) continue;
    const name = rawName.toLowerCase();
    attributes[name] = decodeXmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

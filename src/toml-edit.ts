import { isDeepStrictEqual } from "node:util";
import { parse, stringify } from "smol-toml";

type Dict = Record<string, unknown>;
type Span = { path: string[]; start: number; end: number };

function isRecord(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The dotted key of a `[a.b]` or `[[a.b]]` header, read by the TOML parser so quoting and spacing are its problem. */
function headerPath(header: string): string[] {
  const path: string[] = [];
  let node: unknown = parse(`${header}\n`);
  while (isRecord(node)) {
    const keys = Object.keys(node);
    if (keys.length !== 1) {
      break;
    }
    path.push(keys[0]!);
    node = node[keys[0]!];
    if (Array.isArray(node)) {
      node = node[0];
    }
  }
  return path;
}

function skipString(text: string, from: number, quote: string): number {
  let at = from + 1;
  while (at < text.length && text[at] !== quote && text[at] !== "\n") {
    if (quote === '"' && text[at] === "\\") {
      at++;
    }
    at++;
  }
  if (text[at] === quote) {
    return at + 1;
  }
  return at;
}

function skipMultilineString(text: string, from: number, quote: string): number {
  const fence = quote.repeat(3);
  let at = from + 3;
  while (at < text.length) {
    if (quote === '"' && text[at] === "\\") {
      at += 2;
    } else if (text.startsWith(fence, at)) {
      at += 3;
      for (let extra = 0; extra < 2 && text[at] === quote; extra++) {
        at++;
      }
      return at;
    } else {
      at++;
    }
  }
  return text.length;
}

/**
 * Where each table header sits. A table runs from its header line to the last line that holds a
 * statement; the blank lines and comments before the next header are not part of it. Strings and
 * brackets are followed so a `[` inside a multi-line string or array is not taken for a header.
 */
function scanTables(text: string): Span[] {
  const tables: Span[] = [];
  let depth = 0;
  let lineStart = 0;
  let atStatementStart = true;
  let hasContent = false;
  let contentEnd = 0;
  let at = 0;
  while (at < text.length) {
    const char = text[at]!;
    if (char === "\n") {
      if (depth === 0) {
        if (hasContent) {
          contentEnd = at + 1;
        }
        hasContent = false;
        atStatementStart = true;
        lineStart = at + 1;
      }
      at++;
      continue;
    }
    if (char === " " || char === "\t" || char === "\r") {
      at++;
      continue;
    }
    const startsStatement = atStatementStart;
    atStatementStart = false;
    if (char === "#") {
      while (at < text.length && text[at] !== "\n") {
        at++;
      }
      continue;
    }
    hasContent = true;
    if (char === "[" && startsStatement) {
      let stop = at;
      while (stop < text.length && text[stop] !== "\n" && text[stop] !== "#") {
        if (text[stop] === '"' || text[stop] === "'") {
          stop = skipString(text, stop, text[stop]!);
        } else {
          stop++;
        }
      }
      const previous = tables.at(-1);
      if (previous) {
        previous.end = contentEnd;
      }
      tables.push({ path: headerPath(text.slice(at, stop).trim()), start: lineStart, end: text.length });
      at = stop;
      continue;
    }
    if (char === '"' || char === "'") {
      if (text.startsWith(char.repeat(3), at)) {
        at = skipMultilineString(text, at, char);
      } else {
        at = skipString(text, at, char);
      }
      continue;
    }
    if (char === "[" || char === "{") {
      depth++;
    } else if (char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
    }
    at++;
  }
  if (hasContent) {
    contentEnd = text.length;
  }
  const last = tables.at(-1);
  if (last) {
    last.end = contentEnd;
  }
  return tables;
}

function nest(path: string[], value: Dict): Dict {
  let nested: Dict = value;
  for (const key of path.toReversed()) {
    nested = { [key]: nested };
  }
  return nested;
}

function setAt(root: Dict, path: string[], value: Dict | undefined) {
  let node = root;
  for (const key of path.slice(0, -1)) {
    const child = node[key];
    if (!isRecord(child)) {
      if (value === undefined) {
        return;
      }
      node[key] = {};
    }
    node = node[key] as Dict;
  }
  const last = path.at(-1)!;
  if (value === undefined) {
    delete node[last];
  } else {
    node[last] = value;
  }
}

/** Empty tables carry no data, so a file that keeps or drops a bare `[table]` header still means the same. */
function withoutEmptyTables(value: Dict): Dict {
  const kept: Dict = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isRecord(child)) {
      kept[key] = child;
      continue;
    }
    const pruned = withoutEmptyTables(child);
    if (Object.keys(pruned).length > 0) {
      kept[key] = pruned;
    }
  }
  return kept;
}

function startsWith(path: string[], prefix: string[]): boolean {
  return prefix.every((key, index) => path[index] === key);
}

/** Drops one blank line where a removed table left two, so removing what an insert added restores the original bytes. */
function closeGap(before: string, after: string): [string, string] {
  if (before === "" && after.startsWith("\n")) {
    return [before, after.slice(1)];
  }
  if (!before.endsWith("\n\n")) {
    return [before, after];
  }
  if (after === "") {
    return [before.slice(0, -1), after];
  }
  if (after.startsWith("\n")) {
    return [before, after.slice(1)];
  }
  return [before, after];
}

/**
 * Sets (or, with `undefined`, removes) the table at `path` and its sub-tables, leaving every other
 * byte of `text` as it was: comments, spacing and order survive, which a parse and `stringify` would lose.
 * A layout this editor does not understand, such as the same table written as dotted keys under its parent,
 * is refused instead of being rewritten wrongly: the result must parse to the intended data.
 */
export function editTomlTable(text: string, path: string[], value: Dict | undefined): string {
  const expected = parse(text) as Dict;
  setAt(expected, path, value);

  const owned = scanTables(text).filter((table) => startsWith(table.path, path));
  let edited = text;
  if (owned.length === 0) {
    if (value !== undefined) {
      const block = `${stringify(nest(path, value)).trimEnd()}\n`;
      if (text === "") {
        edited = block;
      } else if (text.endsWith("\n")) {
        edited = `${text}\n${block}`;
      } else {
        edited = `${text}\n\n${block}`;
      }
    }
  } else {
    for (const [index, table] of owned.toReversed().entries()) {
      let before = edited.slice(0, table.start);
      let after = edited.slice(table.end);
      const isFirst = index === owned.length - 1;
      if (isFirst && value !== undefined) {
        edited = `${before}${stringify(nest(path, value)).trimEnd()}\n${after}`;
        continue;
      }
      [before, after] = closeGap(before, after);
      edited = before + after;
    }
  }

  let actual: Dict;
  try {
    actual = parse(edited) as Dict;
  } catch {
    throw new Error(`the file lays out [${path.join(".")}] in a way that cannot be edited in place; edit it by hand`);
  }
  if (!isDeepStrictEqual(withoutEmptyTables(actual), withoutEmptyTables(expected))) {
    throw new Error(`the file lays out [${path.join(".")}] in a way that cannot be edited in place; edit it by hand`);
  }
  return edited;
}

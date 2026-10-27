#!/usr/bin/env node
// Keeps every control on the shadcn/ui kit. Usage: node scripts/check-ui-kit.mjs [srcDir]
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "vite";

const uiRoot = fileURLToPath(new URL("..", import.meta.url));
const srcDir = process.argv[2] ?? join(uiRoot, "src");
const KIT_DIR = join("components", "ui") + sep;
const GLOBAL_STYLESHEET = "index.css";

const rawElements = {
  button: "Button from @/components/ui/button",
  input: "Input from @/components/ui/input (Checkbox or Switch for a checkbox, ToggleGroup for radios)",
  select: "Select from @/components/ui/select",
  textarea: "Textarea from @/components/ui/textarea",
  table: "Table from @/components/ui/table",
  dialog: "Dialog or AlertDialog from @/components/ui/dialog or @/components/ui/alert-dialog",
};

const HARD_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\([^)]*\)?/;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      return [path];
    }
    return [];
  });
}

function lineOf(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function children(node) {
  return Object.entries(node)
    .filter(([key]) => key !== "parent")
    .flatMap(([, value]) => {
      if (Array.isArray(value)) {
        return value;
      }
      return [value];
    })
    .filter((value) => value !== null && typeof value === "object" && typeof value.type === "string");
}

function walk(node, visit) {
  visit(node);
  for (const child of children(node)) {
    walk(child, visit);
  }
}

/** Every string a className or style expression could put on the page: literals, template parts, cn()/cva() arguments. */
function stringsIn(node) {
  const found = [];
  walk(node, (inner) => {
    if (inner.type === "Literal" && typeof inner.value === "string") {
      found.push(inner.value);
    }
    if (inner.type === "TemplateElement") {
      found.push(inner.value.raw);
    }
  });
  return found;
}

function attributeName(node) {
  if (node.name.type === "JSXIdentifier") {
    return node.name.name;
  }
  return "";
}

function check(file) {
  const text = readFileSync(file, "utf8");
  const rel = relative(srcDir, file);
  const inKit = rel.startsWith(KIT_DIR);
  const parsed = parseSync(file, text);
  const problems = [];
  const shown = relative(dirname(srcDir), file);
  const report = (offset, message) => problems.push(`${shown}:${lineOf(text, offset)}: ${message}`);
  for (const error of parsed.errors) {
    problems.push(`${shown}: parse error: ${error.message}`);
  }
  walk(parsed.program, (node) => {
    if (node.type === "ConditionalExpression" || node.type === "TSConditionalType") {
      report(node.start, "ternary operator; use an if/else block or a lookup table instead");
    }
    if (inKit) {
      return;
    }
    if (node.type === "JSXOpeningElement" && node.name.type === "JSXIdentifier") {
      const kit = rawElements[node.name.name];
      if (kit !== undefined) {
        report(node.start, `raw <${node.name.name}>; use ${kit}`);
      }
    }
    if (node.type === "ImportDeclaration" && /\.css$/.test(node.source.value)) {
      const target = join(file, "..", node.source.value);
      if (target !== join(srcDir, GLOBAL_STYLESHEET)) {
        report(node.start, `stylesheet import "${node.source.value}"; style with Tailwind classes and the kit, the only stylesheet is src/${GLOBAL_STYLESHEET}`);
      }
    }
    if (node.type === "JSXAttribute" && ["className", "style"].includes(attributeName(node)) && node.value !== null) {
      const color = stringsIn(node.value).find((value) => HARD_COLOR.test(value));
      if (color !== undefined) {
        report(node.start, `hard-coded color "${HARD_COLOR.exec(color)[0]}" in ${attributeName(node)}; use a theme token class (text-destructive, bg-muted, ...) from src/${GLOBAL_STYLESHEET}`);
      }
    }
  });
  return problems;
}

const problems = sourceFiles(srcDir).flatMap(check);
if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }
  console.error(`\ncheck-ui-kit: ${problems.length} problem(s). Every control comes from src/components/ui (shadcn/ui).`);
  process.exit(1);
}
console.log("check-ui-kit: ok");

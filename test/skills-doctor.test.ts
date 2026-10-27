import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseClaudeProbe, parseCodexProbe, parseGrokProbe } from "../src/skills-doctor.ts";

function sample(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", "probes", name), "utf8");
}

test("the claude probe reads the skills of the init line and waits for it to arrive whole", () => {
  const stream = sample("claude-stream.jsonl");
  assert.deepEqual([...parseClaudeProbe(stream)!.names], [
    "babysit",
    "grill-me",
    "hours-log",
    "tdd",
    "deep-research",
    "i-have-adhd:i-have-adhd",
    "pstack:tdd",
  ]);
  const [hook] = stream.split("\n");
  assert.equal(parseClaudeProbe(`${hook}\n`), undefined);
  assert.equal(parseClaudeProbe(stream.slice(0, -40)), undefined, "a half-written init line is not read");
});

test("the codex probe reads names and skill roots from the skills block of the prompt input", () => {
  const discovery = parseCodexProbe(sample("codex-prompt-input.json"))!;
  assert.deepEqual([...discovery.names], [
    "imagegen",
    "babysit",
    "find-skills",
    "pdf:pdf",
    "bank-reconcile",
    "spreadsheets:Spreadsheets",
    "t3-pstack:tdd",
    "tdd",
  ]);
  assert.deepEqual(discovery.roots.slice(0, 2), ["/Users/me/.codex/skills", "/Users/me/.agents/skills"]);
  assert.equal(parseCodexProbe("not json"), undefined);
  assert.deepEqual(parseCodexProbe("[]"), { names: new Set(), roots: [] });
});

test("the grok probe reads user and project skills and ignores plugin and bundled ones", () => {
  assert.deepEqual([...parseGrokProbe(sample("grok-inspect.txt"))!.names], ["babysit", "deslop", "tdd", "teach", "hours-log"]);
  assert.deepEqual([...parseGrokProbe("  Skills (1)\n  └ notes    project [disabled]\n")!.names], []);
  assert.deepEqual([...parseGrokProbe("  Skills (1)\n  └ notes    project\n\n  Agents (1)\n  └ plan     builtin\n")!.names], ["notes"]);
  assert.equal(parseGrokProbe("  Environment\n  └ CWD: /x\n"), undefined);
});

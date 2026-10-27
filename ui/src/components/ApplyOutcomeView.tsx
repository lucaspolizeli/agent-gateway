import type { ReactNode } from "react";
import type { ApplyOutcome } from "../domain/applyResult.ts";
import { ApplyResultView } from "./ApplyResultView.tsx";
import { Badge, type Tone } from "./Badge.tsx";

type Entry = { dir: string; reason: string };

const MISSING_REASON = "A pasta não existe mais. Recrie a pasta ou desinstale o projeto.";
const UNSAFE_REASON = "A pasta resolve para a configuração do usuário (por exemplo, $HOME), então o agw não escreve nela.";

/** Every bucket of an apply, so a project never disappears from the result: applied, missing, refused or failed. */
export function ApplyOutcomeView({ outcome }: { outcome: ApplyOutcome }) {
  return (
    <>
      {outcome.applied.map((result) => (
        <ApplyResultView key={result.dir} result={result} />
      ))}
      <Bucket
        title="Pasta não encontrada"
        tone="warn"
        entries={outcome.missing.map((dir) => ({ dir, reason: MISSING_REASON }))}
      />
      <Bucket
        title="Recusados"
        tone="warn"
        entries={outcome.unsafe.map((dir) => ({ dir, reason: UNSAFE_REASON }))}
      />
      <Bucket
        title="Não aplicados"
        tone="danger"
        entries={outcome.failed.map((entry) => ({ dir: entry.dir, reason: entry.error }))}
      />
    </>
  );
}

function Bucket({ title, tone, entries }: { title: string; tone: Tone; entries: Entry[] }): ReactNode {
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="bucket">
      <div className="bucket-title">
        <Badge tone={tone}>{title}</Badge>
        <span className="count count-neutral">{entries.length}</span>
      </div>
      <ul className="bucket-list">
        {entries.map((entry) => (
          <li key={entry.dir} className="bucket-entry">
            <span className="mono bucket-dir">{entry.dir}</span>
            <span className="bucket-reason">{entry.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

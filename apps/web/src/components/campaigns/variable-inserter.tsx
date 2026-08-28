"use client";

import { MESSAGE_VARIABLES } from "@/lib/variables";

// Fase P0.2: insertar variables de mensaje sin conocimiento técnico.
export function VariableInserter({
  onInsert,
}: {
  onInsert: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Insertar variable:
      </span>
      {MESSAGE_VARIABLES.map((variable) => (
        <button
          key={variable.key}
          type="button"
          title={`${variable.label} — ${variable.hint}`}
          onClick={() => onInsert(variable.key)}
          className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          {variable.label}
        </button>
      ))}
    </div>
  );
}
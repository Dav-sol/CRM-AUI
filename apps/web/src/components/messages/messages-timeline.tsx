"use client";

import {
  Calendar,
  ExternalLink,
  MessageSquare,
  RotateCcw,
  Shield,
  Zap,
} from "lucide-react";
import Link from "next/link";

import type { AggregatedMessage } from "@/lib/api";
import { stageMomentLabel } from "@/lib/preview";

const SOURCE_META: Record<
  AggregatedMessage["source"],
  { label: string; color: string; icon: typeof MessageSquare }
> = {
  campaign_template: {
    label: "Plantilla de campaña",
    color: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300",
    icon: Zap,
  },
  campaign_stage: {
    label: "Etapa de campaña",
    color: "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    icon: Calendar,
  },
  sequence_stage: {
    label: "Etapa de secuencia",
    color: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300",
    icon: RotateCcw,
  },
  quick_reply: {
    label: "Respuesta rápida",
    color: "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-300",
    icon: MessageSquare,
  },
};

function getStageIcon(anchor: string, offsetDays: number) {
  if (offsetDays < -30) return RotateCcw;
  if (offsetDays < 0) return RotateCcw;
  if (offsetDays === 0) return Shield;
  return Calendar;
}

function sortMessages(messages: AggregatedMessage[]): AggregatedMessage[] {
  return [...messages].sort((a, b) => {
    // Sort by anchor type first (PURCHASE_DATE before WARRANTY_EXPIRY)
    const aAnchor = a.anchor ?? "PURCHASE_DATE";
    const bAnchor = b.anchor ?? "PURCHASE_DATE";
    if (aAnchor !== bAnchor) {
      return aAnchor === "PURCHASE_DATE" ? -1 : 1;
    }
    // Then by offsetDays
    const aOffset = a.offsetDays ?? 0;
    const bOffset = b.offsetDays ?? 0;
    return aOffset - bOffset;
  });
}

type MessagesTimelineProps = {
  messages: AggregatedMessage[];
};

export function MessagesTimeline({ messages }: MessagesTimelineProps) {
  const sorted = sortMessages(messages);

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No hay mensajes para mostrar en el timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-6 top-0 bottom-0 w-px bg-border/60" />

      <div className="space-y-1">
        {sorted.map((msg) => {
          const meta = SOURCE_META[msg.source];
          const Icon = meta.icon;
          const StageIcon = msg.anchor
            ? getStageIcon(msg.anchor, msg.offsetDays ?? 0)
            : MessageSquare;

          return (
            <div
              key={msg.id}
              className="relative flex items-start gap-4 pl-2"
            >
              {/* Timeline node */}
              <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
                <StageIcon className="size-4 text-muted-foreground" />
              </div>

              {/* Content card */}
              <div className="flex-1 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {/* Source badge + name */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.color}`}
                      >
                        <Icon className="size-3" />
                        {meta.label}
                      </span>
                    </div>

                    {/* Source name */}
                    <p className="mt-1.5 text-xs font-medium text-foreground">
                      {msg.sourceName}
                    </p>

                    {/* Moment label */}
                    {msg.anchor && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {stageMomentLabel(msg.anchor, msg.offsetDays ?? 0)}
                      </p>
                    )}

                    {/* Template body */}
                    <p className="mt-1.5 line-clamp-3 text-[11px] whitespace-pre-wrap text-muted-foreground">
                      {msg.body}
                    </p>
                  </div>

                  {/* Link to source editor */}
                  <Link
                    href={
                      msg.source === "campaign_template" ||
                      msg.source === "campaign_stage"
                        ? `/campaigns/editor/${msg.sourceId}`
                        : msg.source === "sequence_stage"
                          ? `/follow-up-sequences`
                          : `/messages`
                    }
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Ir a la fuente"
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

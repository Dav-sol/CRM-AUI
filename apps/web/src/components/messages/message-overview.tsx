"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { AggregatedMessage } from "@/lib/api";

const SOURCE_LABELS: Record<string, string> = {
  campaign_template: "Campaña",
  campaign_stage: "Etapa campaña",
  sequence_stage: "Etapa secuencia",
  quick_reply: "Respuesta rápida",
};

const SOURCE_COLORS: Record<string, string> = {
  campaign_template: "bg-purple-100 text-purple-800",
  campaign_stage: "bg-indigo-100 text-indigo-800",
  sequence_stage: "bg-blue-100 text-blue-800",
  quick_reply: "bg-teal-100 text-teal-800",
};

function editorHref(msg: AggregatedMessage): string | null {
  switch (msg.source) {
    case "campaign_template":
    case "campaign_stage":
      return `/campaigns/editor/${msg.sourceId}`;
    case "sequence_stage":
      return `/follow-up-sequences`;
    case "quick_reply":
      return `/conversations`;
    default:
      return null;
  }
}

interface MessageOverviewProps {
  messages: AggregatedMessage[];
  onUpdated?: () => void;
}

export function MessageOverview({ messages, onUpdated }: MessageOverviewProps) {
  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <MessageRow key={msg.id} msg={msg} onUpdated={onUpdated} />
      ))}
    </div>
  );
}

function MessageRow({
  msg,
  onUpdated,
}: {
  msg: AggregatedMessage;
  onUpdated?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const href = editorHref(msg);

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Badge
              variant="secondary"
              className={`text-xs shrink-0 ${SOURCE_COLORS[msg.source] ?? ""}`}
            >
              {SOURCE_LABELS[msg.source] ?? msg.source}
            </Badge>
            <h3 className="truncate text-sm font-medium">{msg.sourceName}</h3>
          </div>

          <div
            className="cursor-pointer text-sm text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            <p
              className={
                expanded ? "whitespace-pre-wrap" : "line-clamp-2"
              }
            >
              {msg.body}
            </p>
            <button
              className="mt-1 text-xs text-primary hover:underline"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Ver menos" : "Ver más"}
            </button>
          </div>

          {(msg.anchor || msg.offsetDays !== undefined) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {msg.anchor && `Ancla: ${msg.anchor}`}
              {msg.anchor && msg.offsetDays !== undefined && " · "}
              {msg.offsetDays !== undefined &&
                `Offset: ${msg.offsetDays >= 0 ? "+" : ""}${msg.offsetDays} días`}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          {href && (
            <Link
              href={href}
              title="Ir al editor"
              className="inline-flex items-center justify-center rounded-md p-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

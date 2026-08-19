"use client";

import type { ConversationMessage } from "@/lib/sdk-types";
import { Check, CheckCheck, Clock3, MessageSquareText } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<string, typeof Check> = {
  QUEUED: Clock3,
  SENT: Check,
  DELIVERED: Check,
  READ: CheckCheck,
  FAILED: Check,
};

type ThreadProps = {
  messages: ConversationMessage[] | null;
  loading: boolean;
};

export function Thread({ messages, loading }: ThreadProps) {
  if (loading && messages === null) {
    return (
      <div className="space-y-4 p-6" aria-label="Cargando mensajes">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className={cn("flex", index % 2 === 0 ? "justify-start" : "justify-end")}
          >
            <Skeleton className={cn("h-10", index % 2 === 0 ? "w-2/3" : "w-1/2")} />
          </div>
        ))}
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={MessageSquareText}
          title="Sin mensajes todavía"
          description="Cuando haya mensajes en esta conversación, los vas a ver acá."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-6" aria-label="Historial de mensajes">
      {messages.map((message) => {
        const inbound = message.direction === "INBOUND";
        const StatusIcon = STATUS_ICON[message.status] ?? Check;
        const failed = message.status === "FAILED";
        return (
          <div
            key={message.uuid}
            className={cn("flex", inbound ? "justify-start" : "justify-end")}
          >
            <div
              className={cn(
                "max-w-[75%] rounded-lg px-3.5 py-2 text-sm",
                inbound
                  ? "bg-muted text-foreground"
                  : failed
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary text-primary-foreground",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
              <div
                className={cn(
                  "mt-1 flex items-center justify-end gap-1 text-[10px]",
                  inbound ? "text-muted-foreground" : "text-primary-foreground/70",
                )}
              >
                <span>{formatTime(message.sentAt ?? message.createdAt)}</span>
                {!inbound && <StatusIcon className="size-3" aria-label={message.status} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
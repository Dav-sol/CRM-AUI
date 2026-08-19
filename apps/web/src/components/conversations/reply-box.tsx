"use client";

import type { QuickReplyItem } from "@/lib/sdk-types";
import { Loader2, Send, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiListQuickReplies } from "@/lib/api";

type ReplyBoxProps = {
  onSend: (content: string, quickReplyId?: string) => Promise<void>;
};

export function ReplyBox({ onSend }: ReplyBoxProps) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReplyItem[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiListQuickReplies()
      .then((data) => {
        if (!cancelled) {
          setQuickReplies(data);
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiError && error.status === 401) && !cancelled) {
          setQuickReplies([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(quickReply?: QuickReplyItem) {
    const text = (quickReply?.body ?? content).trim();
    if (!text || sending) {
      return;
    }
    setSending(true);
    try {
      await onSend(text, quickReply?.uuid);
      setContent("");
      textareaRef.current?.focus();
    } catch {
      toast.error("No se pudo enviar el mensaje. Intentalo nuevamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-border p-4">
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Escribí tu respuesta… (Enter para enviar)"
          rows={2}
          className="min-h-11 resize-none"
          aria-label="Respuesta"
          disabled={sending}
        />
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label="Respuestas rápidas"
              />
            }
          >
            <Zap />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              Respuestas rápidas
            </div>
            {quickReplies.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                Todavía no hay respuestas rápidas configuradas.
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto p-1">
                {quickReplies.map((quickReply) => (
                  <li key={quickReply.uuid}>
                    <button
                      type="button"
                      onClick={() => void send(quickReply)}
                      className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{quickReply.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {quickReply.body}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
        <Button
          size="icon"
          className="size-11 shrink-0"
          onClick={() => void send()}
          disabled={!content.trim() || sending}
          aria-label="Enviar mensaje"
        >
          {sending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send />}
        </Button>
      </div>
    </div>
  );
}
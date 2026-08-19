"use client";

import { ArrowLeft, PanelRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ConversationList,
  useConversations,
} from "@/components/conversations/conversation-list";
import { ConversationInfoPanel } from "@/components/conversations/info-panel";
import { ReplyBox } from "@/components/conversations/reply-box";
import { StatusBadge } from "@/components/conversations/status-badge";
import { Thread } from "@/components/conversations/thread";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiArchiveConversation,
  apiAssignConversationTag,
  apiCloseConversation,
  apiCreateConversationNote,
  apiGetConversation,
  apiListConversationTags,
  apiRemoveConversationTag,
  apiReopenConversation,
  apiReplyConversation,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 15_000;

export default function ConversationDetailPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params.uuid;

  const [conversation, setConversation] = useState<Awaited<ReturnType<typeof apiGetConversation>> | null>(null);
  const [allTags, setAllTags] = useState<Awaited<ReturnType<typeof apiListConversationTags>>>([]);
  const [loading, setLoading] = useState(true);
  const [activeUuid, setActiveUuid] = useState(uuid);

  if (activeUuid !== uuid) {
    setActiveUuid(uuid);
    setConversation(null);
  }
  const { items: listItems, error: listError } = useConversations({}, 0);

  const refresh = useCallback(async () => {
    try {
      const [data, tagsData] = await Promise.all([
        apiGetConversation(uuid),
        apiListConversationTags(),
      ]);
      setConversation(data);
      setAllTags(tagsData);
      setLoading(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setConversation(null);
        setLoading(false);
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      toast.error("No se pudo cargar la conversación");
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [data, tagsData] = await Promise.all([
          apiGetConversation(uuid),
          apiListConversationTags(),
        ]);
        if (cancelled) {
          return;
        }
        setConversation(data);
        setAllTags(tagsData);
        setLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          setConversation(null);
          setLoading(false);
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        toast.error("No se pudo cargar la conversación");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uuid]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function handleReply(content: string, quickReplyId?: string) {
    try {
      await apiReplyConversation(uuid, { content, quickReplyId });
    } finally {
      await refresh();
    }
  }

  async function handleToggleTag(tagId: string, remove: boolean) {
    if (remove) {
      await apiRemoveConversationTag(uuid, tagId);
    } else {
      await apiAssignConversationTag(uuid, tagId);
    }
    await refresh();
  }

  async function handleAddNote(content: string) {
    await apiCreateConversationNote(uuid, { content });
    await refresh();
  }

  async function handleClose() {
    await apiCloseConversation(uuid);
    await refresh();
  }

  async function handleArchive() {
    await apiArchiveConversation(uuid);
    await refresh();
  }

  async function handleReopen() {
    await apiReopenConversation(uuid);
    await refresh();
  }

  if (loading && conversation === null) {
    return (
      <div className="grid h-full grid-cols-12 gap-4 p-6">
        <div className="col-span-3 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="col-span-9 space-y-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">La conversación no existe o fue eliminada.</p>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-12">
      <aside className="col-span-3 hidden overflow-y-auto border-r border-border lg:block">
        <ConversationList
          items={listItems}
          error={listError}
          selectedUuid={uuid}
          compact
        />
      </aside>

      <div className="col-span-12 flex min-w-0 flex-col lg:col-span-6 xl:col-span-5">
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/conversations"
              aria-label="Volver a conversaciones"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-10 shrink-0 lg:hidden",
              )}
            >
              <ArrowLeft />
            </Link>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">
                {conversation.customerId
                  ? `Cliente #${conversation.customerId.slice(0, 8)}`
                  : "Cliente sin vincular"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {conversation.messageCount} mensajes
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="outline" size="sm" className="xl:hidden">
                    <PanelRight />
                    Detalles
                  </Button>
                }
              />
              <SheetContent side="right" className="w-80 p-0 sm:max-w-sm">
                <ConversationInfoPanel
                  status={conversation.status}
                  customerId={conversation.customerId}
                  advisorName={
                    conversation.advisor
                      ? `${conversation.advisor.firstName} ${conversation.advisor.lastName}`
                      : null
                  }
                  activeTags={conversation.tags}
                  allTags={allTags}
                  notes={conversation.notes}
                  onToggleTag={handleToggleTag}
                  onAddNote={handleAddNote}
                  onClose={handleClose}
                  onArchive={handleArchive}
                  onReopen={handleReopen}
                />
              </SheetContent>
            </Sheet>
            <StatusBadge status={conversation.status} />
          </div>
        </div>

        <Thread
          messages={conversation.messages}
          loading={loading}
        />

        <ReplyBox onSend={handleReply} />
      </div>

      <aside className="col-span-3 hidden border-l border-border xl:block">
        <ConversationInfoPanel
          status={conversation.status}
          customerId={conversation.customerId}
          advisorName={
            conversation.advisor
              ? `${conversation.advisor.firstName} ${conversation.advisor.lastName}`
              : null
          }
          activeTags={conversation.tags}
          allTags={allTags}
          notes={conversation.notes}
          onToggleTag={handleToggleTag}
          onAddNote={handleAddNote}
          onClose={handleClose}
          onArchive={handleArchive}
          onReopen={handleReopen}
        />
      </aside>
    </div>
  );
}
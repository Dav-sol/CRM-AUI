"use client";

import type { ConversationNote, ConversationTagItem } from "@/lib/sdk-types";
import {
  Archive,
  ArchiveRestore,
  CircleCheck,
  Loader2,
  PencilLine,
  Plus,
  Tag,
  UserRoundCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ApiError, apiUpdateCustomer } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { noteSchema } from "@/lib/validators";

type ConversationInfoPanelProps = {
  status: "OPEN" | "CLOSED" | "ARCHIVED";
  customerId: string | null;
  customerUuid?: string | null;
  customerName?: string | null;
  customerStatus?: string | null;
  advisorName?: string | null;
  activeTags: { uuid: string; name: string; color: string | null }[];
  allTags: ConversationTagItem[];
  notes: ConversationNote[];
  onToggleTag: (tagId: string, remove: boolean) => Promise<void>;
  onAddNote: (content: string) => Promise<void>;
  onClose: () => Promise<void>;
  onArchive: () => Promise<void>;
  onReopen: () => Promise<void>;
};

export function ConversationInfoPanel({
  status,
  customerId,
  customerUuid,
  customerName,
  customerStatus,
  advisorName,
  activeTags,
  allTags,
  notes,
  onToggleTag,
  onAddNote,
  onClose,
  onArchive,
  onReopen,
}: ConversationInfoPanelProps) {
  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function runAction(name: string, action: () => Promise<void>) {
    setBusyAction(name);
    try {
      await action();
      toast.success("Conversación actualizada");
    } catch {
      toast.error("No se pudo actualizar la conversación");
    } finally {
      setBusyAction(null);
    }
  }

  async function addNote() {
    const content = noteContent.trim();
    if (!content || savingNote) {
      return;
    }
    const parsed = noteSchema.safeParse({ content });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Nota inválida");
      return;
    }
    setSavingNote(true);
    try {
      await onAddNote(content);
      setNoteContent("");
      toast.success("Nota agregada");
    } catch {
      toast.error("No se pudo agregar la nota");
    } finally {
      setSavingNote(false);
    }
  }

  async function toggleTag(tag: ConversationTagItem) {
    const active = activeTags.some((t) => t.uuid === tag.uuid);
    try {
      await onToggleTag(tag.uuid, active);
    } catch {
      toast.error(
        active
          ? "No se pudo quitar la etiqueta"
          : "No se pudo asignar la etiqueta",
      );
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-4 p-4">
        <section aria-labelledby="info-status">
          <h3
            id="info-status"
            className="text-xs font-semibold tracking-wide text-muted-foreground"
          >
            Estado
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {status === "OPEN" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void runAction("close", onClose)}
                  disabled={busyAction !== null}
                >
                  {busyAction === "close" ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <CircleCheck />
                  )}
                  Cerrar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void runAction("archive", onArchive)}
                  disabled={busyAction !== null}
                >
                  {busyAction === "archive" ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Archive />
                  )}
                  Archivar
                </Button>
              </>
            )}
            {status !== "OPEN" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runAction("reopen", onReopen)}
                disabled={busyAction !== null}
              >
                {busyAction === "reopen" ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <ArchiveRestore />
                )}
                Reabrir
              </Button>
            )}
          </div>
        </section>

        <Separator />

        <section aria-labelledby="info-customer">
          <h3
            id="info-customer"
            className="text-xs font-semibold tracking-wide text-muted-foreground"
          >
            Cliente
          </h3>
          <p className="mt-2 text-sm">
            {customerName ? (
              <>
                <span className="font-medium">{customerName}</span>
                {customerStatus === "PENDING" && (
                  <span className="ml-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                    Pendiente de vinculación
                  </span>
                )}
              </>
            ) : customerId ? (
              <>
                <span className="text-muted-foreground">
                  Cliente sin nombre vinculado
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Sin vincular (número no reconocido)
              </span>
            )}
          </p>
          {customerStatus === "PENDING" && customerUuid && (
            <CompleteContactSheet
              customerUuid={customerUuid}
              customerName={customerName}
            />
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            Asesor: {advisorName ?? "Sin asignar"}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled
                    aria-label="Asignar asesor"
                  />
                }
              >
                <UserRoundCheck />
                Asignar
              </TooltipTrigger>
              <TooltipContent>
                Disponible en una próxima versión (requiere el listado de
                usuarios).
              </TooltipContent>
            </Tooltip>
          </div>
        </section>

        <Separator />

        <section aria-labelledby="info-tags">
          <div className="flex items-center justify-between">
            <h3
              id="info-tags"
              className="text-xs font-semibold tracking-wide text-muted-foreground"
            >
              Etiquetas
            </h3>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    aria-label="Administrar etiquetas"
                  />
                }
              >
                <Plus />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-1">
                {allTags.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    Todavía no hay etiquetas configuradas.
                  </p>
                ) : (
                  <ul className="max-h-56 overflow-y-auto">
                    {allTags.map((tag) => {
                      const active = activeTags.some(
                        (t) => t.uuid === tag.uuid,
                      );
                      return (
                        <li key={tag.uuid}>
                          <button
                            type="button"
                            onClick={() => void toggleTag(tag)}
                            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                          >
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor: tag.color ?? "#a1a1aa",
                              }}
                              aria-hidden="true"
                            />
                            <span className="flex-1 truncate">{tag.name}</span>
                            {active && (
                              <Tag
                                className="size-3.5 text-primary"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </PopoverContent>
            </Popover>
          </div>
          {activeTags.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Sin etiquetas asignadas.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {activeTags.map((tag) => (
                <li
                  key={tag.uuid}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: tag.color ?? "#a1a1aa" }}
                    aria-hidden="true"
                  />
                  {tag.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        <Separator />

        <section aria-labelledby="info-notes">
          <h3
            id="info-notes"
            className="text-xs font-semibold tracking-wide text-muted-foreground"
          >
            Notas internas
          </h3>
          <div className="mt-2 space-y-3">
            {notes.map((note) => (
              <div key={note.uuid} className="rounded-md bg-muted/60 p-2.5">
                <p className="text-sm whitespace-pre-wrap break-words">
                  {note.content}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {note.author.firstName} {note.author.lastName} ·{" "}
                  {formatRelative(note.createdAt)}
                </p>
              </div>
            ))}
            {notes.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin notas todavía.
              </p>
            )}
          </div>
          <div className="mt-3 space-y-2">
            <Textarea
              value={noteContent}
              onChange={(event) => setNoteContent(event.target.value)}
              placeholder="Agregar nota interna…"
              rows={2}
              className="resize-none text-sm"
              aria-label="Nueva nota"
              maxLength={4000}
            />
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => void addNote()}
              disabled={!noteContent.trim() || savingNote}
            >
              {savingNote && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}
              Guardar nota
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function CompleteContactSheet({
  customerUuid,
  customerName,
}: {
  customerUuid: string;
  customerName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(customerName ?? "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit() {
    if (!name.trim() || saving) {
      return;
    }
    setSaving(true);
    try {
      await apiUpdateCustomer(customerUuid, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        city: city.trim() || undefined,
        status: "ACTIVE",
      });
      toast.success("Contacto completado y vinculado");
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("No se pudo completar el contacto");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="mt-2 w-full">
            <PencilLine />
            Completar contacto
          </Button>
        }
      />
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Completar contacto</SheetTitle>
          <SheetDescription>
            Completa los datos del cliente creado desde WhatsApp para
            vincularlo.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
          className="flex-1 space-y-4 overflow-y-auto p-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="complete-name">Nombre</Label>
            <Input
              id="complete-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre del cliente"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="complete-phone">Teléfono</Label>
            <Input
              id="complete-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+57 300 000 0000"
              maxLength={30}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="complete-email">Correo</Label>
            <Input
              id="complete-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="cliente@ejemplo.com"
              maxLength={254}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="complete-city">Ciudad</Label>
            <Input
              id="complete-city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Barranquilla"
              maxLength={200}
            />
          </div>
        </form>
        <SheetFooter className="border-t border-border/60">
          <Button
            type="submit"
            disabled={!name.trim() || saving}
            onClick={() => void onSubmit()}
          >
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            {saving ? "Guardando…" : "Guardar y vincular"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

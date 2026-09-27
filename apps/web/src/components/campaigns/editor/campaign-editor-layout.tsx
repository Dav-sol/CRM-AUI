"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Loader2,
  Megaphone,
  Send,
  Save,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ApiError,
  apiCreateCampaign,
  apiGetCampaign,
  apiGetFollowUpSequence,
  apiListFollowUpSequences,
  apiListProducts,
  apiUpdateCampaign,
} from "@/lib/api";
import type {
  FollowUpSequenceDetail,
  FollowUpSequenceItem,
  ProductItem,
} from "@/lib/sdk-types";
import { cn } from "@/lib/utils";
import { campaignSchema, type CampaignFormValues } from "@/lib/validators";

import { SegmentBuilder } from "./segment-builder";
import { TimelineView } from "./timeline-view";
import { CampaignReview } from "./campaign-review";
import { StageEditorDrawer } from "./stage-editor-drawer";
import { GeneralInfo } from "./general-info";
import { findCampaignPreset } from "./presets";
import { ChannelSelector, type Channel } from "./channel-selector";

type CampaignEditorProps = {
  campaignUuid?: string;
  initialPreset?: string | null;
};

type TabId = "segment" | "timeline" | "review";

const TABS: { id: TabId; label: string }[] = [
  { id: "segment", label: "Segmentación" },
  { id: "timeline", label: "Timeline" },
  { id: "review", label: "Revisión" },
];

export type CampaignStage = {
  id: string;
  name: string;
  anchor: "PURCHASE_DATE" | "WARRANTY_EXPIRY";
  offsetDays: number;
  template: string;
  templateOnPast?: string;
};

const EMPTY_FORM: CampaignFormValues = {
  name: "",
  description: "",
  type: "AUTOMATIC",
  followUpSequenceId: "",
  template: "",
  startAt: "",
  segment: undefined,
  channel: "WHATSAPP" as const,
};

export function CampaignEditor({ campaignUuid, initialPreset }: CampaignEditorProps) {
  const router = useRouter();
  const isEdit = Boolean(campaignUuid);
  const [activeTab, setActiveTab] = useState<TabId>("segment");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [sequences, setSequences] = useState<FollowUpSequenceItem[]>([]);
  const [selectedSequence, setSelectedSequence] =
    useState<FollowUpSequenceDetail | null>(null);
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null);
  // Fase 1: etapas inline editables (Campaign.stages) vs etapas de la
  // secuencia (solo lectura, vienen de FollowUpSequence).
  const [stages, setStages] = useState<CampaignStage[]>([]);
  const [sequenceStages, setSequenceStages] = useState<CampaignStage[]>([]);
  const [editingStage, setEditingStage] = useState<CampaignStage | null>(null);
  const [stageDrawerOpen, setStageDrawerOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("WHATSAPP");

  const isTemplateOnly = isEdit && campaignStatus === "ACTIVE";

  const {
    watch,
    setValue,
    reset,
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    mode: "onTouched",
    defaultValues: EMPTY_FORM,
  });

  const watchedValues = watch();

  useEffect(() => {
    const preset = findCampaignPreset(initialPreset);
    if (!isEdit && preset) {
      setValue("name", preset.values.name);
      setValue("type", preset.values.type);
      setValue("template", preset.values.template);
    }
    // Solo al montar: precarga del preset del recomendador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [productsData, sequencesData] = await Promise.all([
          apiListProducts({ page: 1, limit: 100 }),
          apiListFollowUpSequences({ page: 1, limit: 100 }),
        ]);
        setProducts(productsData.data);
        setSequences(sequencesData.data);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return;
        toast.error("No se pudieron cargar productos y secuencias.");
      }
    }
    void loadData();
  }, []);

  useEffect(() => {
    if (!isEdit || !campaignUuid) return;

    async function loadCampaign() {
      setLoading(true);
      try {
        const campaign = await apiGetCampaign(campaignUuid!);
        setCampaignStatus(campaign.status);

        // Fase 1: restaurar canal del backend.
        const campaignChannel =
          campaign.channel === "SMS" ? "SMS" : "WHATSAPP";
        setChannel(campaignChannel);

        reset({
          name: campaign.name,
          description: campaign.description ?? "",
          type: campaign.type,
          followUpSequenceId: campaign.followUpSequence?.uuid ?? "",
          template: campaign.template,
          startAt: campaign.startAt
            ? new Date(campaign.startAt).toISOString().slice(0, 16)
            : "",
          segment: campaign.segment ?? undefined,
        });

        // Etapas inline persistidas de la campaña.
        setStages(
          (campaign.stages ?? []).map((s, i) => ({
            id: `inline-${i}`,
            name: s.name ?? "",
            anchor: s.anchor,
            offsetDays: s.offsetDays,
            template: s.template,
            templateOnPast: s.templateOnPast ?? undefined,
          })),
        );

        if (campaign.followUpSequence?.uuid) {
          const seq = await apiGetFollowUpSequence(campaign.followUpSequence.uuid);
          setSelectedSequence(seq);
          setSequenceStages(
            seq.stages.map((s) => ({
              id: s.uuid,
              name: s.name,
              anchor: s.anchor,
              offsetDays: s.offsetDays,
              template: s.template,
              templateOnPast: s.templateOnPast ?? undefined,
            })),
          );
        } else {
          setSequenceStages([]);
        }
      } catch {
        toast.error("No se pudo cargar la campaña.");
        router.push("/campaigns");
      } finally {
        setLoading(false);
      }
    }
    void loadCampaign();
  }, [isEdit, campaignUuid, reset, router]);

  useEffect(() => {
    if (!watchedValues.followUpSequenceId) {
      setSelectedSequence(null);
      setSequenceStages([]);
      return;
    }

    async function loadSequence() {
      try {
        const seq = await apiGetFollowUpSequence(
          watchedValues.followUpSequenceId!,
        );
        setSelectedSequence(seq);
        setSequenceStages(
          seq.stages.map((s) => ({
            id: s.uuid,
            name: s.name,
            anchor: s.anchor,
            offsetDays: s.offsetDays,
            template: s.template,
            templateOnPast: s.templateOnPast ?? undefined,
          })),
        );
      } catch {
        // ignore
      }
    }
    void loadSequence();
  }, [watchedValues.followUpSequenceId]);

  const handleAddStage = useCallback(() => {
    const newStage: CampaignStage = {
      id: `new-${Date.now()}`,
      name: "",
      anchor: "PURCHASE_DATE",
      offsetDays: 0,
      template: "",
      templateOnPast: "",
    };
    setEditingStage(newStage);
    setStageDrawerOpen(true);
  }, []);

  const handleEditStage = useCallback((stage: CampaignStage) => {
    setEditingStage(stage);
    setStageDrawerOpen(true);
  }, []);

  const handleSaveStage = useCallback((stage: CampaignStage) => {
    setStages((prev) => {
      const existing = prev.findIndex((s) => s.id === stage.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = stage;
        return updated;
      }
      return [...prev, stage];
    });
    setStageDrawerOpen(false);
    setEditingStage(null);
  }, []);

  const handleDeleteStage = useCallback((stageId: string) => {
    setStages((prev) => prev.filter((s) => s.id !== stageId));
  }, []);

  const handleSaveDraft = useCallback(
    async () => {
      setSaving(true);
      try {
        const rawSegment = watchedValues.segment as Record<string, unknown> | undefined;
        const cleanSegment: Record<string, unknown> | undefined = rawSegment
          ? Object.fromEntries(
              Object.entries(rawSegment).filter(
                ([, v]) => v !== "" && v !== undefined && v !== null,
              ),
            )
          : undefined;

        const hasSequence = Boolean(watchedValues.followUpSequenceId);

        const body: {
          name: string;
          description?: string;
          type: CampaignFormValues["type"];
          followUpSequenceId?: string;
          template: string;
          startAt?: string;
          segment?: Record<string, unknown>;
          channel?: "SMS" | "WHATSAPP_CLIENTS";
          stages?: Array<{
            name?: string;
            anchor: "PURCHASE_DATE" | "WARRANTY_EXPIRY";
            offsetDays: number;
            template: string;
            templateOnPast?: string;
          }>;
        } = {
          name: watchedValues.name,
          description: watchedValues.description || undefined,
          type: watchedValues.type,
          template: watchedValues.template || "",
        };

        // Fase 1: persistir canal seleccionado al backend.
        // El canal se envía una vez al crear; en edición solo si el
        // estado lo permite (DRAFT/APPROVED).
        if (!isEdit) {
          body.channel = channel === "SMS" ? "SMS" : "WHATSAPP_CLIENTS";
        }

        // Only include fields that are allowed for the current status
        if (!isTemplateOnly) {
          body.followUpSequenceId = watchedValues.followUpSequenceId || undefined;
          body.startAt = watchedValues.startAt
            ? new Date(watchedValues.startAt).toISOString()
            : undefined;
          body.segment =
            cleanSegment && Object.keys(cleanSegment).length > 0
              ? cleanSegment
              : undefined;
          // Etapas inline solo sin secuencia (excluyentes en la API).
          body.stages = hasSequence
            ? undefined
            : stages.map((s) => ({
                name: s.name || undefined,
                anchor: s.anchor,
                offsetDays: s.offsetDays,
                template: s.template,
                templateOnPast: s.templateOnPast || undefined,
              }));
        }

        if (isEdit && campaignUuid) {
          await apiUpdateCampaign(campaignUuid, body);
          toast.success("Campaña actualizada");
        } else {
          const result = await apiCreateCampaign(body);
          toast.success("Campaña creada");
          router.replace(`/campaigns/editor/${result.uuid}`);
        }
      } catch (error) {
        if (error instanceof ApiError) {
          toast.error(error.message);
        } else {
          toast.error("No se pudo guardar la campaña.");
        }
      } finally {
        setSaving(false);
      }
    },
    [watchedValues, isEdit, campaignUuid, router, stages, channel],
  );

  const handleCreateCampaign = useCallback(() => {
    const parsed = campaignSchema.safeParse(watchedValues);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      toast.error(
        firstIssue?.message ?? "Completa los campos obligatorios antes de crear la campaña.",
      );
      return;
    }
    void handleSaveDraft();
  }, [watchedValues, handleSaveDraft]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3 lg:px-5">
        <div className="flex items-center gap-3">
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Volver
          </Link>
          <div className="h-4 w-px bg-border/60" />
          <Megaphone className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {isEdit ? "Editar campaña" : "Nueva campaña"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? isTemplateOnly
                  ? "Edita los mensajes de la campaña activa"
                  : "Modifica la configuración de la campaña"
                : "Configura una nueva campaña de seguimiento"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => handleSaveDraft()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar borrador
          </Button>
        </div>
      </header>

      <div className="border-b border-border/60 px-4 lg:px-5">
        <nav className="flex gap-1" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-4 lg:p-5">
          {activeTab === "segment" && (
            <div className="space-y-6">
              {isTemplateOnly && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  La campaña está activa. Solo puedes editar el nombre, descripción y mensajes. Para modificar segmentación, etapas o tipo, pausa la campaña primero.
                </div>
              )}
              <GeneralInfo
                values={watchedValues}
                sequences={sequences}
                disabledFields={isTemplateOnly ? ["type", "followUpSequenceId", "startAt"] : []}
                onChange={(field, value) => {
                  if (field === "name") setValue("name", value);
                  else if (field === "description")
                    setValue("description", value);
                  else if (field === "type")
                    setValue("type", value as CampaignFormValues["type"]);
                  else if (field === "followUpSequenceId")
                    setValue("followUpSequenceId", value);
                  else if (field === "startAt") setValue("startAt", value);
                }}
              />
              <ChannelSelector
                value={channel}
                onChange={setChannel}
                disabled={isTemplateOnly}
              />
              {!isTemplateOnly && (
                <SegmentBuilder
                  products={products}
                  segment={watchedValues.segment}
                  followUpSequenceId={watchedValues.followUpSequenceId}
                  type={watchedValues.type}
                  channel={channel}
                  onChange={(segment) => setValue("segment", segment)}
                />
              )}
            </div>
          )}

          {activeTab === "timeline" && (
            <TimelineView
              stages={selectedSequence ? sequenceStages : stages}
              sequence={selectedSequence}
              readOnly={Boolean(selectedSequence) || isTemplateOnly}
              onAddStage={isTemplateOnly ? () => {} : handleAddStage}
              onEditStage={isTemplateOnly ? () => {} : handleEditStage}
              onDeleteStage={isTemplateOnly ? () => {} : handleDeleteStage}
            />
          )}

          {activeTab === "review" && (
            <CampaignReview
              values={watchedValues}
              stages={selectedSequence ? sequenceStages : stages}
              sequence={selectedSequence}
              products={products}
              channel={channel}
            />
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-border/60 px-4 py-3 lg:px-5">
        <Button
          variant="outline"
          disabled={activeTab === "segment"}
          onClick={() => {
            const currentIndex = TABS.findIndex((t) => t.id === activeTab);
            if (currentIndex > 0) setActiveTab(TABS[currentIndex - 1].id);
          }}
        >
          Anterior
        </Button>
        <div className="flex items-center gap-2">
          {activeTab === "review" ? (
            <>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => handleSaveDraft()}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Guardar borrador
              </Button>
              <Button
                disabled={saving}
                onClick={handleCreateCampaign}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {isEdit ? "Guardar cambios" : "Crear campaña"}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                const currentIndex = TABS.findIndex((t) => t.id === activeTab);
                if (currentIndex < TABS.length - 1)
                  setActiveTab(TABS[currentIndex + 1].id);
              }}
            >
              Siguiente
            </Button>
          )}
        </div>
      </footer>

      <StageEditorDrawer
        open={stageDrawerOpen}
        onOpenChange={setStageDrawerOpen}
        stage={editingStage}
        channel={channel}
        onSave={handleSaveStage}
      />
    </div>
  );
}

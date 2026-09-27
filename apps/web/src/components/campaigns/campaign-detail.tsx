"use client";

import {
  CalendarClock,
  Info,
  Layers,
  MailOpen,
  Megaphone,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CampaignActions } from "@/components/campaigns/campaign-actions";
import {
  CampaignStatusBadge,
  segmentSummary,
} from "@/components/campaigns/campaign-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiGetCampaign,
  apiListAutomations,
  apiPreviewCampaignSegment,
} from "@/lib/api";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { renderPreviewMessage, stageMomentLabel } from "@/lib/preview";
import {
  AUTOMATION_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
} from "@/lib/validators";

type Campaign = Awaited<ReturnType<typeof apiGetCampaign>>;
type Automation = Awaited<
  ReturnType<typeof apiListAutomations>
>["data"][number];

function AutomationStatusBadge({ status }: { status: Automation["status"] }) {
  const variant =
    status === "EXECUTED"
      ? "default"
      : status === "CANCELLED" || status === "ERROR"
        ? "destructive"
        : status === "PAUSED"
          ? "outline"
          : "secondary";
  return <Badge variant={variant}>{AUTOMATION_STATUS_LABELS[status]}</Badge>;
}

export function CampaignDetailView({ uuid }: { uuid: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [preview, setPreview] = useState<{
    count: number;
    estimatedAutomations: number;
    estimatedCost: number;
  } | null>(null);
  const [now] = useState(() => Date.now());
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [campaignData, automationsData] = await Promise.all([
        apiGetCampaign(uuid),
        apiListAutomations({ campaignId: uuid, limit: 50 }),
      ]);
      setCampaign(campaignData);
      setAutomations(automationsData.data);
      setLoading(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.status === 404) {
        setCampaign(null);
        setLoading(false);
        return;
      }
      setError("No se pudo cargar la campaña.");
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [campaignData, automationsData] = await Promise.all([
          apiGetCampaign(uuid),
          apiListAutomations({ campaignId: uuid, limit: 50 }),
        ]);
        if (cancelled) return;
        setCampaign(campaignData);
        setAutomations(automationsData.data);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return;
        if (err instanceof ApiError && err.status === 404) {
          setCampaign(null);
          setLoading(false);
          return;
        }
        setError("No se pudo cargar la campaña.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uuid]);

  async function handlePreview() {
    if (!campaign) return;
    setPreviewLoading(true);
    try {
      const result = await apiPreviewCampaignSegment(uuid, undefined);
      setPreview(result);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading && campaign === null) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6 lg:p-8">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          {error ?? "La campaña no existe o fue eliminada."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-6 lg:p-8">
      {/* Fase 3 (P1-6): campaña aprobada/borrador con inicio cercano sin
          automatizaciones → advertencia para no lanzarla "vacía". */}
      {campaign.automationCount === 0 &&
        campaign.startAt &&
        new Date(campaign.startAt).getTime() <= now + 7 * 86_400_000 &&
        (campaign.status === "APPROVED" || campaign.status === "DRAFT") && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-5 text-sm">
              <span className="font-medium text-destructive">
                Esta campaña está por iniciar sin automatizaciones.
              </span>{" "}
              <span className="text-muted-foreground">
                Aprobala y activala para generar el seguimiento; de lo contrario
                no se enviará ningún mensaje.
              </span>
            </CardContent>
          </Card>
        )}

      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Megaphone className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">
                  {campaign.name}
                </h1>
                <CampaignStatusBadge status={campaign.status} />
                <Badge variant="outline">
                  {CAMPAIGN_TYPE_LABELS[campaign.type]}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {campaign.description || "Sin descripción"}
              </p>
            </div>
            <CampaignActions
              uuid={campaign.uuid}
              status={campaign.status}
              onChanged={() => void refresh()}
            />
            {(campaign.status === "DRAFT" || campaign.status === "APPROVED" || campaign.status === "ACTIVE") && (
              <Link
                href={`/campaigns/editor/${campaign.uuid}`}
                className="inline-flex h-7 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-muted hover:text-foreground"
              >
                Editar
              </Link>
            )}
          </div>

          <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Segmento</p>
              <p className="mt-0.5 text-sm font-medium">
                {segmentSummary(campaign.segment)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inicio</p>
              <p className="mt-0.5 text-sm font-medium">
                {campaign.startAt
                  ? formatDateTime(campaign.startAt)
                  : "No programada"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Automatizaciones</p>
              <p className="mt-0.5 text-sm font-medium">
                {formatNumber(campaign.automationCount)} totales ·{" "}
                {formatNumber(campaign.executedCount)} ejecutadas
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Entregados / Respondidos
              </p>
              <p className="mt-0.5 text-sm font-medium">
                {formatNumber(campaign.delivered)} entregados ·{" "}
                {formatNumber(campaign.responded)} respondidos
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Rendimiento comercial
              </p>
              <p className="mt-0.5 text-sm font-medium">
                {formatNumber(campaign.quotes)} cotizaciones ·{" "}
                {formatNumber(campaign.sales)} ventas
              </p>
              <p className="text-xs text-muted-foreground">
                ${formatCurrency(campaign.revenue)} ingresos · Costo{" "}
                {campaign.channel === "SMS" ? "SMS" : "WhatsApp"} $
                {formatCurrency(campaign.estimatedCost)} · ROI{" "}
                {campaign.roi !== null && campaign.roi !== undefined
                  ? `${(campaign.roi * 100).toFixed(0)}%`
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Qué hace */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Info className="size-4" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold">¿Qué hace esta campaña?</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {campaign.followUpSequence
                    ? "Por cada compra del segmento genera un mensaje automático por cada etapa de la secuencia, programado en la fecha de vencimiento de la garantía del cliente."
                    : "Envía un mensaje de seguimiento a los clientes del segmento para incentivar la recompra y el cuidado post-venta."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mensaje que se envía */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MailOpen className="size-4 text-primary" /> Mensaje que se envía
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {renderPreviewMessage(campaign.template)}
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Ejemplo con datos de muestra. Los placeholders se reemplazan con
              el cliente, producto y organización reales.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Sequence */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="size-4 text-primary" /> Secuencia de
              seguimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {campaign.followUpSequence ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">
                    {campaign.followUpSequence.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Garantía de {campaign.followUpSequence.warrantyMonths} meses
                    · {campaign.followUpSequence.stageCount} etapas
                  </p>
                </div>
                {/* Fase P0-A: preview real de cada mensaje de la secuencia */}
                {campaign.followUpSequence &&
                  (campaign.followUpSequence.stages ?? []).length > 0 && (
                    <div className="space-y-2 border-t border-border/40 pt-2">
                      {campaign.followUpSequence.stages.map((stage) => (
                        <div
                          key={stage.uuid}
                          className="rounded-md border border-border/60 bg-muted/20 p-2"
                        >
                          <p className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium">{stage.name}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {stageMomentLabel(stage.anchor, stage.offsetDays)}
                            </span>
                          </p>
                          <p className="mt-1 text-xs whitespace-pre-wrap">
                            {renderPreviewMessage(stage.template)}
                          </p>
                          {stage.templateOnPast && (
                            <p className="mt-1 border-t border-border/40 pt-1 text-[11px] text-muted-foreground">
                              Si la etapa ya pasó al activar, se envía:{" "}
                              <span className="whitespace-pre-wrap">
                                {renderPreviewMessage(stage.templateOnPast)}
                              </span>
                            </p>
                          )}
                        </div>
                      ))}
                      <p className="text-[11px] text-muted-foreground">
                        Ejemplo de personalización; en ejecución se usan los
                        datos reales de cada cliente.
                      </p>
                    </div>
                  )}
              </div>
            ) : (
              <EmptyState
                icon={Layers}
                title="Sin secuencia"
                description="Esta campaña usa la plantilla base para todos los clientes."
                className="py-6"
              />
            )}
          </CardContent>
        </Card>

        {/* Segment preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-primary" /> Alcance del
              segmento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePreview()}
              disabled={previewLoading}
            >
              {previewLoading ? "Calculando…" : "Calcular clientes"}
            </Button>
            {preview && (
              <div className="mt-3 text-sm">
                <p>
                  <span className="text-lg font-semibold">
                    {formatNumber(preview.count)}
                  </span>{" "}
                  clientes califican para este segmento
                </p>
                <p className="mt-1 text-muted-foreground">
                  ~{formatNumber(preview.estimatedAutomations)} mensajes
                  estimados
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Costo estimado: ~${formatCurrency(preview.estimatedCost)} COP
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Automations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Workflow className="size-4 text-primary" /> Automatizaciones
            generadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {automations === null ? (
            <Skeleton className="h-32 w-full" />
          ) : automations.length === 0 ? (
            <EmptyState
              icon={Workflow}
              title="Sin automatizaciones"
              description="Activa la campaña para generar automatizaciones por etapa."
              className="py-6"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Cliente</th>
                    <th className="py-2 pr-4 font-medium">Etapa</th>
                    <th className="py-2 pr-4 font-medium">Programada para</th>
                    <th className="py-2 pr-4 font-medium">Ejecutada</th>
                    <th className="py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {automations.slice(0, 20).map((automation) => (
                    <tr key={automation.uuid} className="align-top">
                      <td className="py-2 pr-4">
                        {automation.customer?.uuid ? (
                          <Link
                            href={`/customers/${automation.customer.uuid}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {automation.customer.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            {automation.customer?.name ?? "Cliente"}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {automation.stageName ?? automation.campaign?.name ?? "—"}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {formatDateTime(automation.scheduledDate)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {automation.executedDate
                          ? formatDateTime(automation.executedDate)
                          : "—"}
                      </td>
                      <td className="py-2">
                        <AutomationStatusBadge status={automation.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

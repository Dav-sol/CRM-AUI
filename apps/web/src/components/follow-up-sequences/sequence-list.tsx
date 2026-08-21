"use client";

import { Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { SequenceActions } from "@/components/follow-up-sequences/sequence-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListFollowUpSequences } from "@/lib/api";
import type { FollowUpSequenceItem, FollowUpSequenceListParams } from "@/lib/sdk-types";

export type SequenceFilters = {
  page?: number;
  search?: string;
  warrantyMonths?: 12 | 15 | 18 | 24;
  refreshKey?: number;
};

export function useFollowUpSequences(filters: SequenceFilters) {
  const [items, setItems] = useState<FollowUpSequenceItem[] | null>(null);
  const [meta, setMeta] = useState<{ page: number; pages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const params: FollowUpSequenceListParams = {
        page: filters.page ?? 1,
        limit: 20,
      };
      if (filters.search?.trim()) {
        params.search = filters.search.trim();
      }
      if (filters.warrantyMonths) {
        params.warrantyMonths = filters.warrantyMonths;
      }
      try {
        const data = await apiListFollowUpSequences(params);
        if (!cancelled) {
          setItems(data.data);
          setMeta(data.meta ?? null);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        setItems([]);
        setMeta(null);
        setError("No se pudieron cargar las secuencias.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [filters.page, filters.search, filters.warrantyMonths, filters.refreshKey]);

  return { items, meta, error };
}

type SequenceListProps = {
  items: FollowUpSequenceItem[] | null;
  error: string | null;
  onChanged: () => void;
  onSelect: (sequence: FollowUpSequenceItem) => void;
  onEdit: (sequence: FollowUpSequenceItem) => void;
};

export function SequenceList({ items, error, onChanged, onSelect, onEdit }: SequenceListProps) {
  if (items === null) {
    return (
      <div className="space-y-2" aria-label="Cargando secuencias">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 p-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState icon={Zap} title="Error al cargar" description={error} className="py-8" />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Zap}
        title="Sin secuencias"
        description="Cuando crees secuencias de seguimiento, las vas a ver acá."
        className="py-8"
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60" aria-label="Lista de secuencias">
      {items.map((sequence) => (
        <li
          key={sequence.uuid}
          className="flex items-center gap-4 px-4 py-3"
          role="button"
          tabIndex={0}
          aria-label={`Ver detalle de la secuencia ${sequence.name}`}
          onClick={() => onSelect(sequence)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(sequence);
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{sequence.name}</p>
              <Badge variant="outline">{sequence.warrantyMonths} meses</Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {sequence.stageCount === 1 ? "1 etapa" : `${sequence.stageCount} etapas`}
              {sequence.description ? ` · ${sequence.description}` : ""}
            </p>
          </div>
          <SequenceActions
            uuid={sequence.uuid}
            onChanged={onChanged}
            onEdit={() => onEdit(sequence)}
          />
        </li>
      ))}
    </ul>
  );
}
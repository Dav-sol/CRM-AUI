"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { CampaignDetailView } from "@/components/campaigns/campaign-detail";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function CampaignDetailPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params.uuid;

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-6 py-3">
        <Link
          href="/campaigns"
          aria-label="Volver a campañas"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9")}
        >
          <ArrowLeft />
        </Link>
        <h2 className="text-sm font-semibold">Campaña</h2>
      </div>
      <CampaignDetailView uuid={uuid} />
    </div>
  );
}
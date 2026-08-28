"use client";

import { useSearchParams } from "next/navigation";

import { CampaignEditor } from "@/components/campaigns/editor/campaign-editor-layout";

export default function NewCampaignPage() {
  const searchParams = useSearchParams();
  const preset = searchParams.get("preset");

  return <CampaignEditor initialPreset={preset} />;
}

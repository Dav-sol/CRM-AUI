"use client";

import { CampaignEditor } from "@/components/campaigns/editor/campaign-editor-layout";
import { useParams } from "next/navigation";

export default function EditCampaignPage() {
  const params = useParams();
  const uuid = params.uuid as string;

  return <CampaignEditor campaignUuid={uuid} />;
}

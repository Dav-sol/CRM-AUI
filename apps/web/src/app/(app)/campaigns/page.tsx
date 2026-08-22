import { Suspense } from "react";
import { CampaignsIndexPage } from "./list-page";

export default function CampaignsPage() {
  return (
    <Suspense>
      <CampaignsIndexPage />
    </Suspense>
  );
}
"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { CustomerDetailView } from "@/components/customers/customer-detail";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function CustomerDetailPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params.uuid;

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-6 py-3">
        <Link
          href="/customers"
          aria-label="Volver a clientes"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9")}
        >
          <ArrowLeft />
        </Link>
        <h2 className="text-sm font-semibold">Cliente</h2>
      </div>
      <CustomerDetailView uuid={uuid} />
    </div>
  );
}
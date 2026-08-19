"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router, pathname]);

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-8 animate-pulse rounded-full bg-muted" aria-hidden="true" />
        <span className="sr-only">Cargando…</span>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)} />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
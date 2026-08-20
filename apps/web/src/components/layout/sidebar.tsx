"use client";

import {
  BarChart3,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Settings,
  ShoppingCart,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  href?: string;
  available: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", available: true },
  { label: "Clientes", icon: Users, href: "/customers", available: true },
  { label: "Compras", icon: ShoppingCart, href: "/purchases", available: true },
  { label: "Campañas", icon: Megaphone, href: "/campaigns", available: true },
  { label: "Automatizaciones", icon: Workflow, href: "/automations", available: true },
  { label: "Conversaciones", icon: MessagesSquare, href: "/conversations", available: true },
  { label: "Reportes", icon: BarChart3, available: false },
  { label: "Configuración", icon: Settings, available: false },
];

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none",
        collapsed ? "w-16" : "w-60",
      )}
      aria-label="Navegación principal"
    >
      <div className="flex h-16 shrink-0 items-center gap-3 px-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          A
        </div>
        {!collapsed && (
          <span className="truncate text-base font-semibold tracking-tight">
            Automatize It
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = item.href !== undefined && pathname.startsWith(item.href);
          const content = (
            <span
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none md:h-9",
                collapsed && "justify-center px-0",
                active && "bg-sidebar-accent text-sidebar-accent-foreground",
                !active &&
                  item.available &&
                  "text-muted-foreground hover:bg-muted hover:text-foreground",
                !item.available && "cursor-not-allowed text-muted-foreground/50",
              )}
            >
              <item.icon className={cn("size-4.5 shrink-0", active && "text-primary")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && !item.available && (
                <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Próximamente
                </span>
              )}
            </span>
          );

          if (!item.available) {
            return (
              <Tooltip key={item.label}>
                <TooltipTrigger>
                  <span aria-disabled="true" tabIndex={-1}>
                    {content}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Próximamente en la plataforma
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href!}
              aria-label={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              className="block"
            >
              {content}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
"use client";

import { Bell, LogOut, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/auth-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fullName, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type HeaderProps = {
  collapsed: boolean;
  onToggleSidebar: () => void;
};

export function Header({ collapsed, onToggleSidebar }: HeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      toast.error("No se pudo cerrar la sesión");
    }
    router.push("/login");
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={onToggleSidebar}
              aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            />
          }
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </TooltipTrigger>
        <TooltipContent>{collapsed ? "Expandir menú" : "Colapsar menú"}</TooltipContent>
      </Tooltip>

      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Buscar clientes, conversaciones…"
          className="pl-9"
          aria-label="Buscar"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <span
          className={cn(
            "hidden rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground md:block",
          )}
          title="Organización activa"
        >
          {user?.organizationId ? `Org ${user.organizationId.slice(0, 8)}` : "Plataforma"}
        </span>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label="Notificaciones"
                disabled
              />
            }
          >
            <Bell />
          </TooltipTrigger>
          <TooltipContent>Próximamente</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="gap-2 px-2" aria-label="Menú de usuario" />
            }
          >
            <Avatar className="size-7">
              <AvatarFallback className="bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
                {initials(user?.firstName, user?.lastName)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-40 truncate text-sm font-medium lg:block">
              {fullName(user?.firstName, user?.lastName)}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">
                    {fullName(user?.firstName, user?.lastName)}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()}>
              <LogOut />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
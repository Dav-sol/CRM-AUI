"use client";

import { MessageCircle, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";

type Channel = "WHATSAPP" | "SMS";

type ChannelSelectorProps = {
  value: Channel;
  onChange: (channel: Channel) => void;
  disabled?: boolean;
};

const CHANNELS: {
  id: Channel;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "WHATSAPP",
    label: "WhatsApp",
    description: "Mensajes directos por WhatsApp Business",
    icon: <MessageCircle className="size-5" />,
  },
  {
    id: "SMS",
    label: "SMS",
    description: "Mensajes de texto vía proveedor SMS",
    icon: <MessageSquare className="size-5" />,
  },
];

export function ChannelSelector({
  value,
  onChange,
  disabled,
}: ChannelSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Canal de envío</label>
      <div className="grid grid-cols-2 gap-3">
        {CHANNELS.map((channel) => (
          <button
            key={channel.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(channel.id)}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              value === channel.id
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border/60 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <div className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-md",
              value === channel.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}>
              {channel.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{channel.label}</p>
              <p className="text-xs text-muted-foreground">{channel.description}</p>
            </div>
          </button>
        ))}
      </div>
      {value === "SMS" && (
        <p className="text-xs text-muted-foreground">
          Los mensajes SMS tienen un límite de 160 caracteres. El proveedor SMS
          debe estar configurado en el servidor.
        </p>
      )}
    </div>
  );
}

export type { Channel };

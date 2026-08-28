import { cn } from "@/lib/utils";

type ReportKpiProps = {
  label: string;
  value: string | number;
  suffix?: string;
  className?: string;
};

export function ReportKpi({ label, value, suffix, className }: ReportKpiProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-card p-3",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">
        {typeof value === "number" ? value.toLocaleString("es-EC") : value}
        {suffix && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

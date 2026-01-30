import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { fetchAerodromeStatus, mapFlightRuleFromFlag, type FlightRule } from "@/lib/redemet";

type Props = {
  icao: string;
  /** Se quiser forçar a exibição do texto mesmo sem status (ex.: severity != low) */
  fallbackText?: string;
  className?: string;
};

function badgeClassForRule(rule: FlightRule) {
  switch (rule) {
    case "VFR":
      return "bg-accent/20 text-accent border-accent/50";
    case "IFR":
      return "bg-destructive/20 text-destructive border-destructive/50";
    case "LIFR":
      return "bg-secondary/20 text-secondary border-secondary/50";
  }
}

export function FlightRuleBadge({ icao, fallbackText, className }: Props) {
  const upper = String(icao || "").toUpperCase();

  const { data } = useQuery({
    queryKey: ["aerodrome-status", upper],
    enabled: Boolean(upper),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetchAerodromeStatus(upper);
      if (res.error) throw new Error(res.error);
      return res.flag;
    },
  });

  const rule = mapFlightRuleFromFlag(data ?? null);

  if (!rule) {
    return fallbackText ? (
      <Badge variant="secondary" className={className}>
        {fallbackText}
      </Badge>
    ) : null;
  }

  return (
    <Badge variant="outline" className={`${badgeClassForRule(rule)} ${className ?? ""}`.trim()}>
      {rule}
    </Badge>
  );
}

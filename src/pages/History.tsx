import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History as HistoryIcon, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FlightRuleBadge } from "@/components/FlightRuleBadge";
import { expireOutOfWindowActiveAlerts } from "@/lib/alerts-validity";

export default function History() {
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["alerts-history"],
    queryFn: async () => {
      // Mantém o status coerente: avisos fora da validade deixam de ser "active"
      await expireOutOfWindowActiveAlerts();

      const { data, error } = await supabase
        .from("alerts_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="glass-panel neon-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon className="w-5 h-5 text-primary" />
              Histórico de Avisos
            </CardTitle>
            <Button variant="outline" size="sm" className="hover-glow" disabled>
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : alerts && alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <Card
                  key={alert.id}
                  className={`bg-muted/30 border-l-4 ${
                    alert.status === "expired" ? "border-l-destructive" : "border-l-primary"
                  }`}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="bg-primary/20 text-primary">
                            {alert.icao}
                          </Badge>
                          {alert.severity === "low" ? (
                            <FlightRuleBadge icao={alert.icao} fallbackText="LOW" />
                          ) : (
                            <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>{alert.severity}</Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={
                              alert.status === "expired"
                                ? "bg-destructive/20 text-destructive border-destructive/50"
                                : "bg-accent/20 text-accent border-accent/50"
                            }
                          >
                            {alert.status}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium mb-1">{alert.alert_type}</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{alert.content}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {alert.created_at ? new Date(alert.created_at).toLocaleString("pt-BR") : ""}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">Nenhum aviso registrado ainda</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Clock, Bell } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function DashboardHeader() {
  const [utcTime, setUtcTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setUtcTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatUTC = (date: Date) => {
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  return (
    <header className="h-16 border-b border-primary/20 glass-panel flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="hover-glow" />
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">UTC Time</p>
            <p className="text-lg font-mono font-bold glow-text">
              {formatUTC(utcTime)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative hover-glow">
          <Bell className="w-5 h-5" />
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 text-xs animate-glow-pulse"
          >
            0
          </Badge>
        </Button>
      </div>
    </header>
  );
}
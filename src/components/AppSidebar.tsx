import { Activity, Radio, Search } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useIcao } from "@/contexts/icao-context";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [{ title: "Dashboard", url: "/", icon: Activity }];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { icao, inputIcao, setInputIcao, searchIcao } = useIcao();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === "/") return currentPath === path;
    return currentPath.startsWith(path);
  };

  return (
    <Sidebar className="border-r border-border/60" collapsible="offcanvas">
      {/* Brand */}
      <SidebarHeader className="px-5 py-5 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
            <Radio className="w-4 h-4 text-primary" />
            {/* Animated glow ring */}
            <div className="absolute inset-0 rounded-lg border border-primary/20 animate-pulse-glow" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-foreground">
                AeroWatch
              </span>
              <span className="text-[10px] font-mono text-primary/70 leading-none mt-0.5 tracking-wider">
                SYSTEM ACTIVE
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        {/* ICAO Search */}
        <SidebarGroup>
          <SidebarGroupLabel
            className={`text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-2 px-2 ${collapsed ? "sr-only" : ""}`}
          >
            Location
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {collapsed ? (
              <div className="flex justify-center py-1">
                <span className="text-[10px] font-mono font-bold px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
                  {icao}
                </span>
              </div>
            ) : (
              <div className="px-2 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    ICAO:
                  </span>
                  <span className="font-mono text-xs font-bold text-primary tracking-wider glow-text">
                    {icao}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    value={inputIcao}
                    onChange={(e) =>
                      setInputIcao(e.target.value.toUpperCase())
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") searchIcao();
                    }}
                    placeholder="SBMQ"
                    maxLength={4}
                    className="flex-1 min-w-0 bg-muted border border-border rounded-md px-2.5 py-1.5 text-sm font-bold text-foreground font-mono placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
                  />
                  <Button
                    onClick={searchIcao}
                    size="sm"
                    className="h-[34px] px-2.5 bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20 shrink-0"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Navigation */}
        <SidebarGroup className="mt-4">
          <SidebarGroupLabel
            className={`text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-2 px-2 ${collapsed ? "sr-only" : ""}`}
          >
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all ${
                          active
                            ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_12px_hsl(190_95%_55%/0.08)]"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                        activeClassName="bg-primary/10 text-primary"
                      >
                        <item.icon className="w-4 h-4" />
                        {!collapsed && (
                          <span className="font-medium">{item.title}</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-5 py-3 border-t border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <div className="absolute w-2 h-2 rounded-full bg-primary animate-ping opacity-40" />
          </div>
          {!collapsed && (
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              SYS ONLINE
            </span>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

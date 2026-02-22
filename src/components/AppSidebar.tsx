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

const navItems = [
  { title: "Dashboard", url: "/", icon: Activity },
];

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
    <Sidebar className="glass-panel border-r w-64 transition-all" collapsible="offcanvas">
      <SidebarHeader className="p-4 border-b border-primary/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center neon-border">
            <Radio className="w-6 h-6 text-primary animate-glow-pulse" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-lg font-bold glow-text">AeroWatch</h2>
              <p className="text-xs text-muted-foreground">Aviation Alerts</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>
            Localidade
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {collapsed ? (
              <div className="px-1 py-1 flex justify-center">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                  {icao}
                </span>
              </div>
            ) : (
              <div className="px-2 py-1 space-y-2">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  ICAO ativo: <span className="font-mono text-primary">{icao}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={inputIcao}
                    onChange={(e) => setInputIcao(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") searchIcao();
                    }}
                    placeholder="SBMQ"
                    maxLength={4}
                    className="w-20 bg-transparent border-b border-primary text-base font-bold text-white font-mono outline-none"
                  />
                  <Button onClick={searchIcao} size="sm" className="h-7 px-2.5">
                    <Search className="w-3.5 h-3.5 mr-1" />
                    Ir
                  </Button>
                </div>
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>
            Navegação
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
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                          active
                            ? "bg-primary/20 text-primary neon-border"
                            : "hover:bg-muted/50"
                        }`}
                        activeClassName="bg-primary/20 text-primary neon-border"
                      >
                        <item.icon className={`w-5 h-5 ${active ? "animate-glow-pulse" : ""}`} />
                        {!collapsed && <span className="font-medium">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-primary/20">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-glow-pulse" />
          {!collapsed && (
            <span className="text-xs text-muted-foreground">Sistema Online</span>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

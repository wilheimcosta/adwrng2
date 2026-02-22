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
    <Sidebar className="border-r border-border/50" collapsible="offcanvas">
      <SidebarHeader className="px-4 py-5 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">AeroWatch</h2>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Aviation Alerts</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className={`text-[11px] uppercase tracking-wider text-muted-foreground font-medium ${collapsed ? "sr-only" : ""}`}>
            Localidade
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {collapsed ? (
              <div className="px-1 py-1 flex justify-center">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  {icao}
                </span>
              </div>
            ) : (
              <div className="px-2 py-2 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>ICAO ativo:</span>
                  <span className="font-mono text-primary font-semibold">{icao}</span>
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
                    className="w-20 bg-muted/50 border border-border rounded-md px-2 py-1.5 text-sm font-bold text-foreground font-mono outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                  />
                  <Button onClick={searchIcao} size="sm" className="h-8 px-3 text-xs font-medium">
                    <Search className="w-3.5 h-3.5 mr-1.5" />
                    Ir
                  </Button>
                </div>
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={`text-[11px] uppercase tracking-wider text-muted-foreground font-medium ${collapsed ? "sr-only" : ""}`}>
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
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          active
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }`}
                        activeClassName="bg-primary/10 text-primary border border-primary/20"
                      >
                        <item.icon className="w-4 h-4" />
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

      <SidebarFooter className="px-4 py-3 border-t border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {!collapsed && (
            <span className="text-xs text-muted-foreground">Sistema Online</span>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

import { Activity, Radio } from "lucide-react";
import { NavLink } from "@/components/NavLink";
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
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === "/") return currentPath === path;
    return currentPath.startsWith(path);
  };

  return (
    <Sidebar className={`glass-panel border-r ${collapsed ? "w-16" : "w-64"} transition-all`} collapsible="icon">
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

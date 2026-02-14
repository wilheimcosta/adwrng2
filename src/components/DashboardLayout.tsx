interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen w-full">
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}

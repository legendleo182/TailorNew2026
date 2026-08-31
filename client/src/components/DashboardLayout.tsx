import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  LogOut,
  Scissors,
  Store,
  UsersRound,
} from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: FileText, label: "Bills", path: "/bills" },
  { icon: Store, label: "Shops", path: "/shops" },
  { icon: UsersRound, label: "Customers", path: "/customers" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#102018] px-5 py-10 text-[#fffdf7] flex items-center justify-center">
        <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.07] p-8 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-[#c7ed6a] text-[#102018]">
            <Scissors className="h-7 w-7" />
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#c7ed6a]">Silai Ledger</p>
          <h1 className="mt-3 font-display text-4xl">Your studio, organised.</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">Sign in to securely manage your shops, customers, bills, and private bill images.</p>
          <Button onClick={() => startLogin()} className="mt-7 h-12 w-full rounded-xl bg-[#c7ed6a] text-[#102018] hover:bg-[#d9f48f]">
            Sign in securely
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas" className="border-r border-[#20352a] bg-[#102018] text-[#f7f3eb]">
        <SidebarHeader className="px-4 pb-5 pt-5">
          <div className="flex items-center gap-3 px-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#c7ed6a] text-[#102018] shadow-lg shadow-[#c7ed6a]/10">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-xl leading-none">Silai Ledger</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#a4b8a9]">Billing workspace</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3">
          <p className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f9787]">Workspace</p>
          <SidebarMenu>
            {menuItems.map(item => <NavigationItem item={item} key={item.path} />)}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-left transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c7ed6a]">
                <Avatar className="h-8 w-8 border border-white/10">
                  <AvatarFallback className="bg-[#304737] text-xs text-[#e9f1da]">{user.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name || "Workspace owner"}</p>
                  <p className="truncate text-xs text-[#a4b8a9]">Secure account</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-svh bg-[#f6f2ea]">
        <div className="sticky top-0 z-30 flex h-16 items-center border-b border-[#ded8ca] bg-[#f6f2ea]/90 px-4 backdrop-blur md:hidden">
          <SidebarTrigger className="mr-3 rounded-lg border border-[#dcd4c4] bg-white" />
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-[#447251]" />
            <span className="font-display text-xl text-[#163020]">Silai Ledger</span>
          </div>
        </div>
        <main className="min-w-0 p-4 md:p-7 lg:p-9">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NavigationItem({ item }: { item: (typeof menuItems)[number] }) {
  const [location, setLocation] = useLocation();
  const active = location === item.path;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        onClick={() => setLocation(item.path)}
        className="h-11 rounded-xl px-3 text-[#cbd8cb] transition-all hover:bg-white/[0.08] hover:text-white data-[active=true]:bg-[#c7ed6a] data-[active=true]:font-semibold data-[active=true]:text-[#102018]"
      >
        <item.icon className="h-[18px] w-[18px]" />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

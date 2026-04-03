"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Megaphone,
  Layers,
  FileText,
  BarChart3,
  Globe,
  Link2,
  Cable,
  Key,
  BookOpen,
  CreditCard,
  LogOut,
  ChevronsUpDown,
  Building2,
  Moon,
  Sun,
  ImageIcon,
} from "lucide-react"
import { useTheme } from "next-themes"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface Workspace {
  id: string
  name: string
  slug: string
  meta_business_name: string | null
}

interface AppSidebarProps {
  workspaces: Workspace[]
  currentWorkspace?: Workspace | null
  user: { email: string; name?: string }
}

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
}

export function AppSidebar({ workspaces, currentWorkspace, user }: AppSidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const slug = currentWorkspace?.slug

  const overviewItems: NavItem[] = [
    {
      title: "Dashboard",
      url: slug ? `/dashboard/${slug}` : "/dashboard",
      icon: LayoutDashboard,
    },
  ]

  const metaAdsItems: NavItem[] = slug
    ? [
        { title: "Campaigns", url: `/dashboard/${slug}/campaigns`, icon: Megaphone },
        { title: "Ad Sets", url: `/dashboard/${slug}/adsets`, icon: Layers },
        { title: "Ads", url: `/dashboard/${slug}/ads`, icon: FileText },
        { title: "Creatives", url: `/dashboard/${slug}/creatives`, icon: ImageIcon },
        { title: "Insights", url: `/dashboard/${slug}/insights`, icon: BarChart3 },
        { title: "Pages", url: `/dashboard/${slug}/pages`, icon: Globe },
      ]
    : []

  const settingsItems: NavItem[] = slug
    ? [
        { title: "Billing", url: `/dashboard/${slug}/billing`, icon: CreditCard },
        { title: "MCP Connections", url: `/dashboard/${slug}/connections`, icon: Cable },
        { title: "Connect Meta", url: `/dashboard/${slug}/connect`, icon: Link2 },
        { title: "API Keys", url: `/dashboard/${slug}/api-keys`, icon: Key },
        { title: "Setup Guide", url: `/dashboard/${slug}/setup`, icon: BookOpen },
      ]
    : []

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase()

  return (
    <div className="flex h-full flex-col">
      {/* Header: Logo */}
      <div className="p-4 pb-2">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-lg font-light tracking-tight font-display bg-gradient-to-r from-violet-brand to-cyan-brand bg-clip-text text-transparent">
            VibeFly
          </span>
        </Link>
      </div>

      {/* Workspace Switcher */}
      {workspaces.length > 0 && (
        <div className="px-3 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-sidebar-accent transition-colors">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-brand/10 text-violet-brand">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {currentWorkspace?.name ?? "Select workspace"}
                  </p>
                  {currentWorkspace?.meta_business_name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {currentWorkspace.meta_business_name}
                    </p>
                  )}
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {workspaces.map((ws) => (
                <DropdownMenuItem key={ws.id} asChild>
                  <Link href={`/dashboard/${ws.slug}`}>
                    <Building2 className="mr-2 h-4 w-4" />
                    {ws.name}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/new" className="text-muted-foreground">
                  + New Workspace
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="mx-3 h-px bg-border" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        <NavGroup label="Overview" items={overviewItems} pathname={pathname} />
        {metaAdsItems.length > 0 && (
          <NavGroup label="Meta Ads" items={metaAdsItems} pathname={pathname} />
        )}
        {settingsItems.length > 0 && (
          <NavGroup label="Settings" items={settingsItems} pathname={pathname} />
        )}
      </nav>

      {/* User footer */}
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-sidebar-accent transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-violet-brand/10 text-violet-brand text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{user.name ?? user.email.split("@")[0]}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" className="w-56">
            <DropdownMenuItem
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 mr-2" />
              ) : (
                <Moon className="h-4 w-4 mr-2" />
              )}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form action="/api/auth/signout" method="POST" className="w-full">
                <button type="submit" className="flex w-full items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function NavGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <div>
      <p className="mb-1 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const isActive = pathname === item.url
          return (
            <li key={item.title}>
              <Link
                href={item.url}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.title}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

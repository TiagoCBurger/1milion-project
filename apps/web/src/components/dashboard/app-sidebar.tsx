"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Megaphone,
  Link2,
  Cable,
  BookOpen,
  CreditCard,
  Radar,
  LogOut,
  ChevronsUpDown,
  Building2,
  Moon,
  Sun,
  Package,
  Users,
  ShoppingCart,
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
  enable_meta_mutations?: boolean
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
  /** @deprecated prefer activePathPrefixes */
  activePathPrefix?: string
  activePathPrefixes?: string[]
}

function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.activePathPrefixes?.length) {
    return item.activePathPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  }
  if (item.activePathPrefix) {
    const p = item.activePathPrefix
    return pathname === item.url || pathname.startsWith(`${p}/`)
  }
  return pathname === item.url
}

export function AppSidebar({ workspaces, currentWorkspace, user }: AppSidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const slug = currentWorkspace?.slug

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" })
    window.location.assign("/login")
  }

  const overviewItems: NavItem[] = [
    {
      title: "Dashboard",
      url: slug ? `/dashboard/${slug}` : "/dashboard",
      icon: LayoutDashboard,
    },
  ]

  const operationItems: NavItem[] = slug
    ? [
        { title: "Produtos", url: `/dashboard/${slug}/produtos`, icon: Package },
        { title: "Clientes", url: `/dashboard/${slug}/clientes`, icon: Users },
        { title: "Vendas", url: `/dashboard/${slug}/vendas`, icon: ShoppingCart },
        {
          title: "Campanhas",
          url: `/dashboard/${slug}/campaigns`,
          icon: Megaphone,
          activePathPrefixes: [
            `/dashboard/${slug}/campaigns`,
            `/dashboard/${slug}/adsets`,
            `/dashboard/${slug}/ads`,
            `/dashboard/${slug}/creatives`,
            `/dashboard/${slug}/insights`,
            `/dashboard/${slug}/pages`,
          ],
        },
      ]
    : []

  const settingsItems: NavItem[] = slug
    ? [
        {
          title: "Integrações",
          url: `/dashboard/${slug}/integrations`,
          icon: Link2,
          activePathPrefix: `/dashboard/${slug}/integrations`,
        },
        { title: "Rastreamento & CAPI", url: `/dashboard/${slug}/tracking`, icon: Radar },
        { title: "Assinatura", url: `/dashboard/${slug}/billing`, icon: CreditCard },
        { title: "Conexões MCP", url: `/dashboard/${slug}/connections`, icon: Cable },
        { title: "Guia de Setup", url: `/dashboard/${slug}/setup`, icon: BookOpen },
      ]
    : []

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase()

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 pb-2">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-lg font-light tracking-tight font-display bg-gradient-to-r from-violet-brand to-cyan-brand bg-clip-text text-transparent">
            VibeFly
          </span>
        </Link>
      </div>

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
                    {currentWorkspace?.name ?? "Selecionar espaço"}
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
              <DropdownMenuLabel>Espaços de trabalho</DropdownMenuLabel>
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
                  + Novo espaço
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="mx-3 h-px bg-border" />

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        <NavGroup label="Visão geral" items={overviewItems} pathname={pathname} />
        {operationItems.length > 0 && (
          <NavGroup label="Operação" items={operationItems} pathname={pathname} />
        )}
        {settingsItems.length > 0 && (
          <NavGroup label="Configurações" items={settingsItems} pathname={pathname} />
        )}
      </nav>

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
              {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={(e) => {
                e.preventDefault()
                void handleSignOut()
              }}
            >
              <LogOut className="h-4 w-4" />
              Sair
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
          const isActive = isNavActive(pathname, item)
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

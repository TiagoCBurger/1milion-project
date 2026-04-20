"use client"

import Link from "next/link"
import { BrandLogo } from "@/components/brand-logo"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Megaphone,
  Link2,
  Cable,
  CreditCard,
  LogOut,
  ChevronsUpDown,
  Building2,
  Moon,
  Sun,
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
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { defaultOrganizationSlug } from "@/lib/organizations"
import { ProjectSwitcher } from "./project-switcher"

interface Organization {
  id: string
  name: string
  slug: string
  meta_business_name: string | null
  enable_meta_mutations?: boolean
}

interface AppSidebarProps {
  workspaces: Organization[]
  currentWorkspace?: Organization | null
  currentProjectSlug?: string
  user: { email: string; name?: string }
}

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  /** @deprecated prefer activePathPrefixes */
  activePathPrefix?: string
  activePathPrefixes?: string[]
  /** Show a subtle “Em breve” label in the sidebar */
  comingSoon?: boolean
  children?: NavItem[]
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

export function AppSidebar({ workspaces, currentWorkspace, currentProjectSlug, user }: AppSidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const slug = currentWorkspace?.slug
  const fallbackSlug = defaultOrganizationSlug(workspaces)
  const effectiveSlug = slug ?? fallbackSlug
  // Parse project slug from the URL when the route has the nested shape
  // /dashboard/[orgSlug]/[projectSlug]/... — fall back to the prop.
  const pathParts = pathname.split("/")
  const urlProjectSlug =
    pathParts[1] === "dashboard" && pathParts[2] === slug ? pathParts[3] : undefined
  const resolvedProjectSlug = currentProjectSlug ?? urlProjectSlug
  const homeDashboardHref = effectiveSlug
    ? `/dashboard/${effectiveSlug}`
    : "/dashboard/new"

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" })
    window.location.assign("/login")
  }

  const overviewItems: NavItem[] = [
    {
      title: "Dashboard",
      url: homeDashboardHref,
      icon: LayoutDashboard,
    },
  ]

  const operationItems: NavItem[] = slug
    ? [
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
          children: [
            {
              title: "Conexões MCP",
              url: `/dashboard/${slug}/integrations/mcp`,
              icon: Cable,
              activePathPrefix: `/dashboard/${slug}/integrations/mcp`,
            },
          ],
        },
      ]
    : []

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase()

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 pb-2">
        <BrandLogo href={homeDashboardHref} sidebar />
      </div>

      <div className="px-3 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-sidebar-accent transition-colors">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-vf-lime/20 text-vf-ink">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {currentWorkspace?.name ??
                    (workspaces.length === 0 ? "Criar organização" : "Selecionar organização")}
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
            <DropdownMenuLabel>Organizações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workspaces.map((org) => (
              <DropdownMenuItem key={org.id} asChild>
                <Link href={`/dashboard/${org.slug}`}>
                  <Building2 className="mr-2 h-4 w-4" />
                  {org.name}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/new" className="text-muted-foreground">
                + Nova organização
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {slug ? (
        <div className="px-3 pb-2">
          <ProjectSwitcher orgSlug={slug} currentProjectSlug={resolvedProjectSlug} />
        </div>
      ) : null}

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
                <AvatarFallback className="bg-vf-lime/20 text-vf-ink text-xs font-semibold">
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
            {slug ? (
              <>
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/${slug}/billing`}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Assinatura
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
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
          const hubActive = isNavActive(pathname, item)
          const childActive = item.children?.some((c) => isNavActive(pathname, c)) ?? false
          return (
            <li key={item.title}>
              <Link
                href={item.url}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                  hubActive
                    ? "bg-sidebar-accent font-medium text-foreground"
                    : childActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{item.title}</span>
                  {item.comingSoon ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 px-1.5 py-0 text-[10px] font-normal uppercase tracking-wide text-muted-foreground"
                    >
                      Em breve
                    </Badge>
                  ) : null}
                </span>
              </Link>
              {item.children?.length ? (
                <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
                  {item.children.map((child) => {
                    const isChildActive = isNavActive(pathname, child)
                    return (
                      <li key={child.title}>
                        <Link
                          href={child.url}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                            isChildActive
                              ? "bg-sidebar-accent font-medium text-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                          )}
                        >
                          <child.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{child.title}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

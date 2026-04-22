"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Check,
  ChevronsUpDown,
  FolderKanban,
  Plus,
  Settings2,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type ProjectSummary = {
  id: string
  name: string
  slug: string
  is_default: boolean
  ad_account_count: number
  site_count: number
}

interface ProjectSwitcherProps {
  orgSlug: string
  currentProjectSlug?: string
}

/**
 * Client-side project switcher. Fetches projects for the active organization
 * and persists the user's pick in a cookie so future visits land on it.
 */
export function ProjectSwitcher({ orgSlug, currentProjectSlug }: ProjectSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [filter, setFilter] = useState("")

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Resolve organization id from the slug — we need it for the API route.
        const res = await fetch(`/api/organizations/by-slug/${encodeURIComponent(orgSlug)}/projects`, {
          credentials: "include",
        })
        if (!res.ok) return
        const { projects: rows } = (await res.json()) as { projects: ProjectSummary[] }
        if (!cancelled) setProjects(rows)
      } catch {
        /* ignore — UI falls back to empty list */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [orgSlug])

  const current = currentProjectSlug
    ? projects.find((p) => p.slug === currentProjectSlug)
    : projects.find((p) => p.is_default)

  const filtered = filter
    ? projects.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
    : projects

  function pickProject(nextSlug: string) {
    document.cookie = `last_project:${orgSlug}=${encodeURIComponent(nextSlug)}; path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax`
    // Replace the current project slug segment in the URL if present, else append.
    const parts = pathname.split("/")
    // Expected: ["", "dashboard", "<orgSlug>", "<projectSlug>", ...]
    if (parts[1] === "dashboard" && parts[2] === orgSlug) {
      if (parts[3] && projects.some((p) => p.slug === parts[3])) {
        parts[3] = nextSlug
      } else {
        parts.splice(3, 0, nextSlug)
      }
      router.push(parts.join("/") || `/dashboard/${orgSlug}/${nextSlug}`)
    } else {
      router.push(`/dashboard/${orgSlug}/${nextSlug}`)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-sidebar-accent transition-colors">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-vf-lime/15 text-vf-ink">
            <FolderKanban className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Projeto
            </p>
            <p className="text-sm font-medium truncate">
              {current?.name ??
                (projects.length === 0 ? "Carregando…" : "Selecionar projeto")}
            </p>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel>Projetos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.length > 5 ? (
          <div className="px-2 pb-2">
            <Input
              placeholder="Filtrar…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        ) : null}
        {filtered.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={(e) => {
              e.preventDefault()
              pickProject(p.slug)
            }}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                current?.id === p.id ? "opacity-100" : "opacity-0"
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.ad_account_count} contas · {p.site_count} sites
                {p.is_default ? " · padrão" : ""}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
        {filtered.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Nenhum projeto encontrado.
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/${orgSlug}/projects/new`}>
            <Plus className="mr-2 h-4 w-4" />
            Novo projeto
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/${orgSlug}/projects`} className="text-muted-foreground">
            <Settings2 className="mr-2 h-4 w-4" />
            Gerenciar projetos
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

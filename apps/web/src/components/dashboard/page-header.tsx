import React from "react"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

interface BreadcrumbSegment {
  label: string
  href?: string
}

interface PageHeaderProps {
  breadcrumbs: BreadcrumbSegment[]
}

export function PageHeader({ breadcrumbs }: PageHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbs.map((segment, i) => {
            const isLast = i === breadcrumbs.length - 1
            return (
              <React.Fragment key={i}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={segment.href}>
                      {segment.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}

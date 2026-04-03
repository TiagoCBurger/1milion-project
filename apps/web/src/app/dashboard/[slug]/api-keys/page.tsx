import { redirect } from "next/navigation"

export default function ApiKeysPage({ params }: { params: { slug: string } }) {
  redirect(`/dashboard/${params.slug}`)
}

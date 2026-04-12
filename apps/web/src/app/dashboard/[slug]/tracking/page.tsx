"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Send, Eye, EyeOff } from "lucide-react";

const TRACK_WORKER_URL =
  process.env.NEXT_PUBLIC_TRACK_WORKER_URL ?? "https://track-worker.ticburger.workers.dev";

export default function TrackingPage() {
  const { slug } = useParams<{ slug: string }>();
  const supabase = createClient();

  const [workspaceId, setWorkspaceId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [capiToken, setCapiToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id, pixel_id, capi_access_token")
        .eq("slug", slug)
        .single();
      if (!ws) return;
      setWorkspaceId(ws.id);
      setPixelId(ws.pixel_id ?? "");
      setCapiToken(ws.capi_access_token ?? "");
    }
    load();
  }, [slug, supabase]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("workspaces")
      .update({ pixel_id: pixelId || null, capi_access_token: capiToken || null })
      .eq("id", workspaceId);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  async function handleTestEvent() {
    if (!pixelId || !capiToken) {
      setTestResult({
        success: false,
        message: "Salve o ID do Pixel e o token da CAPI antes de testar.",
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${TRACK_WORKER_URL}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          event_name: "PageView",
          event_id: crypto.randomUUID(),
          event_time: Math.floor(Date.now() / 1000),
          event_source_url: window.location.href,
          action_source: "website",
          user_data: {},
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({
          success: true,
          message: `Evento enviado. ID: ${data.event_id}`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Não foi possível enviar o evento.",
        });
      }
    } catch (err) {
      setTestResult({ success: false, message: `Erro de rede: ${String(err)}` });
    }
    setTesting(false);
  }

  // Generate the snippet for external sites
  const snippet = pixelId && workspaceId
    ? `<!-- VibeFly Meta Tracking -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"/></noscript>

<script>
// VibeFly CAPI Bridge — sends server-side events for deduplication
(function(){
  var W='${workspaceId}',U='${TRACK_WORKER_URL}/track';
  function getCk(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?m[1]:void 0}
  function getFbc(){var c=getCk('_fbc');if(c)return c;var p=new URLSearchParams(location.search),f=p.get('fbclid');return f?'fb.1.'+Date.now()+'.'+f:void 0}
  window.vfTrack=function(ev,userData,customData){
    var eid=crypto.randomUUID();
    if(window.fbq)fbq('track',ev,customData||{},{eventID:eid});
    var payload={workspace_id:W,event_name:ev,event_id:eid,event_time:Math.floor(Date.now()/1000),event_source_url:location.href,action_source:'website',user_data:Object.assign({fbc:getFbc(),fbp:getCk('_fbp')},userData||{}),custom_data:customData};
    navigator.sendBeacon?navigator.sendBeacon(U,JSON.stringify(payload)):fetch(U,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true});
  };
  window.vfTrack('PageView');
})();
</script>
<!-- End VibeFly Meta Tracking -->`
    : "";

  function handleCopy() {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex-1 p-6 space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Espaços de trabalho", href: "/dashboard" },
          { label: String(slug), href: `/dashboard/${slug}` },
          { label: "Rastreamento" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rastreamento e CAPI</h1>
        <p className="text-muted-foreground mt-1">
          Configure o Pixel da Meta e a API de Conversões para rastreamento com enriquecimento de
          dados e deduplicação entre navegador e servidor.
        </p>
      </div>

      {/* Config Card */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pixel-id">ID do Pixel (Meta)</Label>
            <Input
              id="pixel-id"
              placeholder="123456789012345"
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Events Manager → Fontes de dados → Pixel → Configurações
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="capi-token">Token de acesso da API de Conversões (CAPI)</Label>
            <div className="flex gap-2">
              <Input
                id="capi-token"
                type={showToken ? "text" : "password"}
                placeholder="EAAxxxxxxxx..."
                value={capiToken}
                onChange={(e) => setCapiToken(e.target.value)}
              />
              <Button variant="outline" size="icon" onClick={() => setShowToken(!showToken)}>
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Events Manager → Configurações → API de Conversões → Gerar token de acesso
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : saved ? "Salvo!" : "Salvar configuração"}
            </Button>
            <Button variant="outline" onClick={handleTestEvent} disabled={testing}>
              <Send className="h-4 w-4 mr-2" />
              {testing ? "Enviando…" : "Enviar evento de teste"}
            </Button>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${testResult.success ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
              {testResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snippet Card */}
      {snippet && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Snippet de instalação</h3>
                <p className="text-sm text-muted-foreground">
                  Cole no <code>&lt;head&gt;</code> do site para Pixel + CAPI com deduplicação.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-xs leading-relaxed">
              <code>{snippet}</code>
            </pre>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">Eventos personalizados</h4>
              <p className="text-sm text-muted-foreground">
                Depois de instalar o snippet, use <code>vfTrack()</code> para disparar eventos:
              </p>
              <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-xs leading-relaxed">
                <code>{`// Lead com dados do usuário
vfTrack('Lead', {
  email: 'user@example.com',
  phone: '+5511999999999',
  first_name: 'João',
  last_name: 'Silva'
});

// Compra com custom_data
vfTrack('Purchase', { email: 'user@example.com' }, {
  value: 99.90,
  currency: 'BRL',
  content_name: 'Nome do produto',
  content_ids: ['SKU123'],
  num_items: 1
});

// Eventos suportados:
// PageView, ViewContent, Lead, InitiateCheckout,
// AddToCart, AddPaymentInfo, Purchase, CompleteRegistration,
// Subscribe, Contact, CustomizeProduct, FindLocation,
// Schedule, SubmitApplication, StartTrial, Search`}</code>
              </pre>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">Enriquecimento de dados</h4>
              <div className="flex flex-wrap gap-2">
                {[
                  "Email (SHA-256)",
                  "Phone (SHA-256)",
                  "Name (SHA-256)",
                  "Location (SHA-256)",
                  "IP Address",
                  "User Agent",
                  "fbc / fbclid",
                  "fbp",
                  "external_id",
                ].map((item) => (
                  <Badge key={item} variant="secondary">{item}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Dados pessoais são hasheados no servidor (SHA-256) antes do envio à Meta. IP e user
                agent são capturados automaticamente pelo servidor.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

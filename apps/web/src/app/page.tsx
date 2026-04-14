import Link from "next/link";
import { ArrowRight, Building2, Rocket, Target } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export default function Home() {
  return (
    <main className="min-h-screen bg-vf-cream text-vf-heading overflow-hidden">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <BrandLogo href="/" />
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/login"
            className="text-sm text-vf-muted hover:text-vf-heading transition-colors"
          >
            Entrar
          </Link>
          <Link
            href="/signup"
            className="text-sm rounded-full bg-vf-lime text-vf-ink px-4 py-2 font-semibold shadow-md shadow-vf-ink/5 hover:brightness-95 transition"
          >
            Comece grátis
          </Link>
        </div>
      </nav>

      {/* Hero — alinhado à esquerda como no reference */}
      <section className="relative px-6 pt-12 pb-24 max-w-6xl mx-auto w-full">
        <div className="absolute top-20 right-0 w-[420px] h-[420px] bg-vf-lime/15 blur-[100px] rounded-full pointer-events-none hidden lg:block" />

        <div className="relative z-10 max-w-2xl text-left">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-vf-border bg-white/70 text-sm text-vf-muted mb-8 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-vf-lime" />
            Vibe Marketing é agora
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight leading-[1.12] font-display text-vf-heading">
            Superpoderes de marketing para você e seus{" "}
            <span className="font-medium">agentes de IA</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-vf-muted max-w-xl leading-relaxed">
            Conectamos suas ferramentas de marketing à inteligência artificial. Sem
            gambiarras. Sem fricção. Do seu jeito.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:items-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-vf-lime text-vf-ink px-8 py-4 font-semibold shadow-lg shadow-vf-ink/10 hover:brightness-95 transition"
            >
              Comece grátis. Sério.
              <ArrowRight className="h-4 w-4 opacity-80" strokeWidth={2} />
            </Link>
            <Link
              href="#como-funciona"
              className="inline-flex items-center justify-center rounded-full border border-vf-border bg-transparent text-vf-ink px-8 py-4 font-medium hover:bg-white/60 transition-colors"
            >
              Como funciona?
            </Link>
          </div>
        </div>
      </section>

      {/* Social proof micro */}
      <section className="border-y border-vf-border py-8 bg-white/40">
        <div className="flex flex-wrap items-center justify-center gap-8 text-vf-muted text-sm max-w-4xl mx-auto px-6">
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold text-vf-heading">3s</span>
            <span>pra resposta que levava 2h</span>
          </div>
          <div className="w-px h-8 bg-vf-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold text-vf-heading">0</span>
            <span>configuração técnica</span>
          </div>
          <div className="w-px h-8 bg-vf-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold text-vf-heading">100%</span>
            <span>do seu jeito</span>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-24 px-6 max-w-5xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-light text-vf-heading text-center mb-4 font-display">
          Funciona assim. Sem mistério.
        </h2>
        <p className="text-vf-muted text-center mb-16 max-w-xl mx-auto">
          Três passos entre você e ter um time de IA trabalhando nas suas campanhas.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="group p-6 rounded-2xl border border-vf-border bg-white hover:border-vf-muted/30 transition-all shadow-sm shadow-vf-ink/[0.02]">
            <div className="w-10 h-10 rounded-xl bg-vf-lime/25 flex items-center justify-center mb-4">
              <span className="font-mono text-vf-heading font-bold">01</span>
            </div>
            <h3 className="text-lg font-normal mb-2 font-display text-vf-heading">Conecte</h3>
            <p className="text-vf-muted text-sm leading-relaxed">
              Plugue sua conta de anúncios em dois cliques. A gente cuida do resto.
              Prometemos que é mais rápido que o Business Manager carregar.
            </p>
          </div>

          <div className="group p-6 rounded-2xl border border-vf-border bg-white hover:border-vf-muted/30 transition-all shadow-sm shadow-vf-ink/[0.02]">
            <div className="w-10 h-10 rounded-xl bg-vf-lime/25 flex items-center justify-center mb-4">
              <span className="font-mono text-vf-heading font-bold">02</span>
            </div>
            <h3 className="text-lg font-normal mb-2 font-display text-vf-heading">Converse</h3>
            <p className="text-vf-muted text-sm leading-relaxed">
              Abra o Claude, Cursor, ou qualquer agente MCP e pergunte o que quiser.
              &quot;Como tá o ROAS da campanha do João?&quot; — resposta na hora.
            </p>
          </div>

          <div className="group p-6 rounded-2xl border border-vf-border bg-white hover:border-vf-muted/30 transition-all shadow-sm shadow-vf-ink/[0.02]">
            <div className="w-10 h-10 rounded-xl bg-vf-lime/25 flex items-center justify-center mb-4">
              <span className="font-mono text-vf-heading font-bold">03</span>
            </div>
            <h3 className="text-lg font-normal mb-2 font-display text-vf-heading">Voe</h3>
            <p className="text-vf-muted text-sm leading-relaxed">
              Analise, otimize e gerencie campanhas conversando com sua IA. Aquele
              relatório de 40 páginas? Agora são 3 frases.
            </p>
          </div>
        </div>
      </section>

      {/* Pra quem é */}
      <section className="py-24 px-6 border-t border-vf-border bg-white/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-light text-center mb-4 font-display text-vf-heading">
            Pra quem faz mais do que deveria{" "}
            <span className="font-medium">com menos do que precisa</span>
          </h2>
          <p className="text-vf-muted text-center mb-16 max-w-xl mx-auto">
            O VibeFly dá a você o time que você não tem.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-white border border-vf-border shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-vf-lime/25 text-vf-heading">
                <Target className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="font-normal mb-2 font-display text-vf-heading">Gestor de Tráfego</h3>
              <p className="text-vf-muted text-sm leading-relaxed">
                10 clientes, 1 você. A IA vira seu analista de dados e assistente
                de campanha. Escale sem contratar.
              </p>
              <p className="mt-4 text-xs text-vf-muted/80 italic font-mono">
                &quot;Se eu tivesse mais 4h no dia, dobraria meu faturamento.&quot;
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-vf-border shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-vf-lime/25 text-vf-heading">
                <Rocket className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="font-normal mb-2 font-display text-vf-heading">Empreendedor</h3>
              <p className="text-vf-muted text-sm leading-relaxed">
                Faz anúncio, atende cliente, cuida do financeiro. Agora conversa
                com a IA sobre suas campanhas em linguagem simples.
              </p>
              <p className="mt-4 text-xs text-vf-muted/80 italic font-mono">
                &quot;Eu só queria saber se meu dinheiro tá sendo bem gasto.&quot;
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-vf-border shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-vf-lime/25 text-vf-heading">
                <Building2 className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="font-normal mb-2 font-display text-vf-heading">Microagência</h3>
              <p className="text-vf-muted text-sm leading-relaxed">
                2 a 5 pessoas fazendo trabalho de 20. Seus agentes de IA viram
                parte do time. Para de ser o gargalo.
              </p>
              <p className="mt-4 text-xs text-vf-muted/80 italic font-mono">
                &quot;Preciso parar de ser o gargalo da minha própria empresa.&quot;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Manifesto CTA */}
      <section className="py-24 px-6 border-t border-vf-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-light mb-6 font-display text-vf-heading">
            O marketing mudou.{" "}
            <span className="text-vf-muted">E dessa vez, não volta.</span>
          </h2>
          <p className="text-vf-muted text-lg leading-relaxed mb-4">
            A IA não substitui pessoas — ela amplifica quem sabe o que perguntar.
            Ferramentas devem conversar entre si. Quando não conversam, nós
            construímos a ponte.
          </p>
          <p className="text-vf-muted/90 text-base mb-10">
            Um negócio inteiro deveria caber num único lugar — conectado,
            acessível, sob seu controle.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-vf-lime text-vf-ink px-8 py-4 font-semibold shadow-lg shadow-vf-ink/10 hover:brightness-95 transition"
          >
            Isso é vibe marketing. Comece agora.
            <ArrowRight className="h-4 w-4 opacity-80" strokeWidth={2} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-vf-border py-8 px-6 bg-white/40">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-vf-muted">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <BrandLogo href="/" />
            <span className="text-xs text-vf-muted/90">
              CNPJ: 61.750.788/0001-48
            </span>
          </div>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-vf-heading transition-colors">
              Termos
            </Link>
            <Link href="/privacy" className="hover:text-vf-heading transition-colors">
              Privacidade
            </Link>
          </div>
          <span>© 2026 VibeFly</span>
        </div>
      </footer>
    </main>
  );
}

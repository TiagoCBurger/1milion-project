import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white overflow-hidden">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <span className="text-xl font-light tracking-tight font-display bg-gradient-to-r from-violet-brand to-cyan-brand bg-clip-text text-transparent">
          VibeFly
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-slate-400 hover:text-white transition"
          >
            Entrar
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-violet-brand hover:bg-violet-dark px-4 py-2 rounded-lg font-medium transition"
          >
            Comece grátis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center text-center px-6 pt-24 pb-32 max-w-4xl mx-auto">
        {/* Glow background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-br from-violet-brand/20 to-cyan-brand/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-slate-700 bg-slate-800/50 text-sm text-slate-400 mb-8">
            <span className="w-2 h-2 rounded-full bg-cyan-brand animate-pulse" />
            Vibe Marketing é agora
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-light tracking-tight leading-[1.1] font-display">
            Superpoderes de Marketing{" "}
            <span className="bg-gradient-to-r from-violet-brand to-cyan-brand bg-clip-text text-transparent">
              para você e seus agentes de IA
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Conectamos suas ferramentas de marketing à inteligência artificial.
            Sem gambiarras. Sem fricção.{" "}
            <span className="text-slate-300">Do seu jeito.</span>
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="group relative px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-brand to-violet-dark hover:from-violet-light hover:to-violet-brand transition-all shadow-lg shadow-violet-brand/25"
            >
              Comece grátis. Sério.
            </Link>
            <Link
              href="#como-funciona"
              className="px-8 py-4 rounded-xl font-semibold border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
            >
              Como funciona?
            </Link>
          </div>
        </div>
      </section>

      {/* Social proof micro */}
      <section className="border-y border-slate-800 py-8">
        <div className="flex flex-wrap items-center justify-center gap-8 text-slate-400 text-sm max-w-4xl mx-auto px-6">
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold text-amber-brand">3s</span>
            <span>pra resposta que levava 2h</span>
          </div>
          <div className="w-px h-8 bg-slate-700 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold text-amber-brand">0</span>
            <span>configuração técnica</span>
          </div>
          <div className="w-px h-8 bg-slate-700 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold text-amber-brand">100%</span>
            <span>do seu jeito</span>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-24 px-6 max-w-5xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-light text-center mb-4 font-display">
          Funciona assim. Sem mistério.
        </h2>
        <p className="text-slate-400 text-center mb-16 max-w-xl mx-auto">
          Três passos entre você e ter um time de IA trabalhando nas suas campanhas.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="group p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-violet-brand/50 transition-all">
            <div className="w-10 h-10 rounded-lg bg-violet-brand/10 flex items-center justify-center mb-4">
              <span className="font-mono text-violet-light font-bold">01</span>
            </div>
            <h3 className="text-lg font-normal mb-2 font-display">Conecte</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Plugue sua conta de anúncios em dois cliques. A gente cuida do resto.
              Prometemos que é mais rápido que o Business Manager carregar.
            </p>
          </div>

          <div className="group p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-cyan-brand/50 transition-all">
            <div className="w-10 h-10 rounded-lg bg-cyan-brand/10 flex items-center justify-center mb-4">
              <span className="font-mono text-cyan-light font-bold">02</span>
            </div>
            <h3 className="text-lg font-normal mb-2 font-display">Converse</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Abra o Claude, Cursor, ou qualquer agente MCP e pergunte o que quiser.
              &quot;Como tá o ROAS da campanha do João?&quot; — resposta na hora.
            </p>
          </div>

          <div className="group p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-amber-brand/50 transition-all">
            <div className="w-10 h-10 rounded-lg bg-amber-brand/10 flex items-center justify-center mb-4">
              <span className="font-mono text-amber-light font-bold">03</span>
            </div>
            <h3 className="text-lg font-normal mb-2 font-display">Voe</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Analise, otimize e gerencie campanhas conversando com sua IA.
              Aquele relatório de 40 páginas? Agora são 3 frases.
            </p>
          </div>
        </div>
      </section>

      {/* Pra quem é */}
      <section className="py-24 px-6 border-t border-slate-800">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-light text-center mb-4 font-display">
            Pra quem faz mais do que deveria{" "}
            <span className="bg-gradient-to-r from-violet-brand to-cyan-brand bg-clip-text text-transparent">
              com menos do que precisa
            </span>
          </h2>
          <p className="text-slate-400 text-center mb-16 max-w-xl mx-auto">
            O VibeFly dá a você o time que você não tem.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
              <div className="text-2xl mb-3">🎯</div>
              <h3 className="font-normal mb-2 font-display">Gestor de Tráfego</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                10 clientes, 1 você. A IA vira seu analista de dados e assistente
                de campanha. Escale sem contratar.
              </p>
              <p className="mt-4 text-xs text-slate-500 italic font-mono">
                &quot;Se eu tivesse mais 4h no dia, dobraria meu faturamento.&quot;
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
              <div className="text-2xl mb-3">🚀</div>
              <h3 className="font-normal mb-2 font-display">Empreendedor</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Faz anúncio, atende cliente, cuida do financeiro. Agora conversa
                com a IA sobre suas campanhas em linguagem simples.
              </p>
              <p className="mt-4 text-xs text-slate-500 italic font-mono">
                &quot;Eu só queria saber se meu dinheiro tá sendo bem gasto.&quot;
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
              <div className="text-2xl mb-3">🏢</div>
              <h3 className="font-normal mb-2 font-display">Microagência</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                2 a 5 pessoas fazendo trabalho de 20. Seus agentes de IA viram
                parte do time. Para de ser o gargalo.
              </p>
              <p className="mt-4 text-xs text-slate-500 italic font-mono">
                &quot;Preciso parar de ser o gargalo da minha própria empresa.&quot;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Manifesto CTA */}
      <section className="py-24 px-6 border-t border-slate-800">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-light mb-6 font-display">
            O marketing mudou.{" "}
            <span className="text-slate-400">E dessa vez, não volta.</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed mb-4">
            A IA não substitui pessoas — ela amplifica quem sabe o que perguntar.
            Ferramentas devem conversar entre si. Quando não conversam, nós
            construímos a ponte.
          </p>
          <p className="text-slate-500 text-base mb-10">
            Um negócio inteiro deveria caber num único lugar — conectado,
            acessível, sob seu controle.
          </p>
          <Link
            href="/signup"
            className="inline-flex px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-brand to-cyan-brand hover:from-violet-light hover:to-cyan-light transition-all shadow-lg shadow-violet-brand/20"
          >
            Isso é vibe marketing. Comece agora.
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span className="font-light font-display bg-gradient-to-r from-violet-brand to-cyan-brand bg-clip-text text-transparent">
            VibeFly
          </span>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-slate-300 transition">
              Termos
            </Link>
            <Link href="/privacy" className="hover:text-slate-300 transition">
              Privacidade
            </Link>
          </div>
          <span>© 2026 VibeFly</span>
        </div>
      </footer>
    </main>
  );
}

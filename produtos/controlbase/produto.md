# ControlBase — Definição do Produto

## Conceito

**Hook:** "Eu gerencio um negócio inteiro pelo Claude. Veja como."

**Mecanismo Único:** Torre de Controle — um repositório central conectado via MCPs a todas as ferramentas reais do negócio, de onde o Claude opera com contexto completo e dados ao vivo.

**Problema que resolve:** fragmentação. O negócio existe em 20 ferramentas que não conversam. O dono é o único elo — quando para, tudo para. Toda nova ferramenta de IA começa do zero porque não sabe nada do negócio.

**Solução:** uma Torre de Controle. Repositório estruturado onde campanhas, clientes, processos e métricas existem em formato conectado. MCPs puxam dados ao vivo de Meta Ads, Hotmart, email. O Claude lê tudo, age sobre tudo — sem precisar de instrução a cada sessão.

**Diferencial:** não é "usar Claude" e nem uma pasta com prompts. É infraestrutura. A diferença entre um assistente que você briefa toda hora e uma torre que já sabe tudo e executa quando você manda.

---

## Principais Benefícios

**1. Um negócio integrado e conectado**
Todas as partes do negócio — clientes, campanhas, métricas, conteúdo, processos — existem em um único lugar que se fala. Acaba a fragmentação. O que acontece num ponto reflete nos outros.

**2. Mais produtividade, menos overhead**
Sem briefar do zero, sem copiar e colar entre ferramentas, sem reconstruir contexto. Você dá a ordem — a Torre executa. O que levava horas passa a levar minutos.

**3. Menos custo com ferramentas**
Notion, Monday, RD Station, ferramentas de email, de relatório, de briefing — boa parte pode ser substituída. O repositório faz o que elas fazem, sem mensalidade.

**4. Conexão com sistemas e ferramentas externas**
Via MCPs, a Torre se conecta ao Meta Ads, Hotmart, Google, email marketing — e puxa dados ao vivo direto para o contexto do Claude. Sem exportar, sem copiar, sem atualizar manualmente.

**5. Um team de agentes ao seu dispor**
Não é um assistente. É uma equipe. Cada skill é um especialista — um cria campanha, outro escreve email, outro gera relatório, outro analisa métricas. Você coordena. Eles executam. Solo, mas com leverage de agência.

---

## Estrutura do Template

```
controlbase/
│
├── CLAUDE.md                    # Contexto principal — quem é o negócio, como a IA deve se comportar
├── README.md                    # Visão geral humana do repo
│
├── .rules/                      # Regras globais para IA
│   ├── brand-voice.md           # Tom, linguagem, o que evitar
│   ├── content.md               # Como criar conteúdo
│   └── workflow.md              # Como executar tarefas no repo
│
├── .skills/                     # Comandos reutilizáveis
│   ├── create-post.md
│   ├── campaign-brief.md
│   ├── write-email.md
│   ├── write-sequence.md
│   ├── write-campaign-email.md
│   ├── send-campaign.md
│   └── weekly-report.md
│
├── brand/
│   ├── CLAUDE.md
│   ├── identity.md
│   ├── voice-and-tone.md
│   ├── visual-guidelines.md
│   └── personas/
│       ├── CLAUDE.md
│       └── ideal-customer.md
│
├── strategy/
│   ├── CLAUDE.md
│   ├── positioning.md
│   ├── annual-goals.md
│   └── competitors/
│       └── CLAUDE.md
│
├── campaigns/
│   ├── CLAUDE.md
│   ├── _template/
│   │   ├── brief.md
│   │   ├── assets.md
│   │   └── results.md
│   └── 2026/
│
├── content/
│   ├── CLAUDE.md
│   ├── calendar.md
│   ├── social/
│   │   ├── CLAUDE.md
│   │   └── instagram/
│   ├── email/
│   │   └── CLAUDE.md
│   └── blog/
│       └── CLAUDE.md
│
├── clients/
│   ├── CLAUDE.md
│   ├── _template/
│   └── cliente-a/
│       ├── brief.md
│       ├── history.md
│       └── assets/
│
├── sops/
│   ├── CLAUDE.md
│   ├── onboarding-cliente.md
│   ├── aprovacao-conteudo.md
│   └── entrega-campanha.md
│
├── data/
│   ├── clients/
│   │   └── cliente-a.yaml
│   ├── leads/
│   │   └── pipeline.csv
│   ├── products/
│   │   └── produto-x.yaml
│   └── audience/
│       └── personas.yaml
│
├── metrics/
│   ├── CLAUDE.md
│   ├── reports/
│   │   ├── _template.md
│   │   └── 2026-03-meta-ads.md
│   └── raw/
│       └── meta-export-2026-03.csv
│
├── email-marketing/
│   ├── CLAUDE.md
│   ├── config.yaml
│   ├── lists/
│   │   ├── subscribers.csv
│   │   ├── leads.csv
│   │   └── customers.csv
│   ├── sequences/
│   │   ├── welcome/
│   │   │   ├── 01-boas-vindas.md
│   │   │   ├── 02-entrega-valor.md
│   │   │   └── 03-oferta.md
│   │   └── nurture/
│   ├── campaigns/
│   │   ├── _template.md
│   │   └── lancamento-abril.md
│   └── templates/
│       └── base-layout.html
│
├── integrations/
│   ├── meta-ads/
│   │   ├── CLAUDE.md
│   │   └── config.yaml
│   └── hotmart/
│       └── config.yaml
│
└── docs/
    ├── getting-started.md
    ├── 01-o-que-e-controlbase.md
    └── 02-como-usar-com-ia.md
```

---

## Módulos

**Aula de Abertura — O Conceito e Por Que Ele Existe**
- O problema real: negócio fragmentado, você como único elo, IA genérica
- O que é a Torre de Controle e como ela resolve isso
- Uma demonstração real: mostrando o negócio sendo gerenciado ao vivo pelo Claude
- O que você vai construir ao longo do curso e o que vai ser diferente no seu dia a dia
- Objetivo: o aluno entende o destino antes de dar o primeiro passo

**Módulo 0 — Conceitos Básicos para Não-Técnicos**
- O que é uma API e como ferramentas se conversam por baixo dos panos
- O que é uma IDE e por que você vai usar o VS Code
- O que é o terminal e como não ter medo dele
- O que é Git, o que é um repositório e por que versionar muda tudo
- Como usar o Git sem linha de comando (GitHub Desktop)
- O que é um arquivo, uma pasta e uma extensão — no contexto de código
- Objetivo: chegar no Módulo 1 sem travar em conceito nenhum

**Módulo 1 — Fundamentos do Claude Code**
- O que é o Claude Code e por que ele é diferente do Claude.ai
- Como o Claude Code lê arquivos, pastas e contexto
- O que é um CLAUDE.md e como ele funciona
- O que são skills e como chamá-las
- O que são MCPs e o que eles permitem fazer
- Objetivo: entender o terreno antes de construir a Torre

**Módulo 1 — Setup da Torre**
- O que é o ControlBase e por que ele existe
- Instalando o repositório (GitHub Desktop / VS Code)
- Primeira conversa com o Claude dentro da Torre
- Objetivo: zero ao funcionando no mesmo dia

**Módulo 2 — Configurando o Contexto do Negócio**
- Preenchendo o CLAUDE.md principal (quem é você, seu negócio, seu avatar)
- Brand voice e regras de marca
- Objetivo: Claude para de ser genérico

**Módulo 3 — Suas Primeiras Skills**
- Rodando a primeira skill (create-post, campaign-brief ou write-email)
- Como criar uma skill nova do zero
- Objetivo: primeira entrega real saindo da Torre

**Módulo 4 — Conectando Ferramentas Externas (MCPs)**
- O que são MCPs e por que mudam tudo
- Conectando Meta Ads ao Claude
- Conectando Hotmart / email marketing
- Objetivo: dados ao vivo dentro da Torre

---

## Camadas de Dados

### Camada 1 — Dados como arquivos (core)
Dados estáticos ou que mudam pouco vivem como arquivos versionados (YAML, CSV). Legíveis pela IA, versionados pelo Git, editáveis no Excel/Sheets.

### Camada 2 — Relatórios como snapshots
Dados que mudam (métricas, resultados) viram snapshots periódicos em markdown e YAML.

### Camada 3 — Dados dinâmicos via MCP (futuro)
MCPs puxam dados ao vivo para o contexto da IA.

| Tipo de dado | Formato | Por quê |
|---|---|---|
| Perfis de clientes | YAML | Legível pela IA, estruturado |
| Pipeline de leads | CSV | Compatível com Excel/Sheets |
| Métricas/resultados | YAML + MD | Versionável, consultável |
| Exports de plataforma | CSV raw | Importação direta |
| Relatórios gerados | Markdown | IA escreve, humano lê |
| Configurações | YAML | Simples, editável |

---

## Ferramentas compatíveis

- Claude Code
- Cursor
- Git via interface visual (GitHub Desktop, VS Code)

---

## Entrega

- Template completo do repo
- CLAUDE.md hierárquico configurado
- .rules com regras de marca prontas para editar
- .skills com skills prontos para uso imediato
- _templates para campanha, cliente e relatório
- Vídeo de setup (screencast do zero ao funcionando)
- **Acesso vitalício + atualizações**

---

## Bônus

### B1 — IA Generativa no Repo
Skills integrados com fal.ai e kie.ai. Brief → imagem/vídeo gerado pela IA.

### B2 — Funil do Zero, Publicado de Graça
Criar e publicar páginas sem pagar ferramenta. GitHub Pages.

### B3 — Email Marketing no Repo
Listas em CSV + skills de envio via Resend/SES. Sem mensalidade.

### B4 — Venda Seu Próprio ControlBase
Licença + tutorial para criar e vender template para o seu nicho.

---

## Roadmap

| Produto | Status | Descrição |
|---|---|---|
| ControlBase (template + aulas) | **MVP** | Produto de entrada |
| MCP Meta Ads | Futuro | Integração ao vivo com Facebook/Instagram Ads |
| MCP Google | Futuro | Google Ads + Analytics direto no contexto |
| MCP Hotmart / Kiwify | Futuro | Dados de vendas automáticos no repo |
| ControlBase para Agências | Futuro | Versão multi-cliente |
| Comunidade | Futuro | Após base de usuários estabelecida |
| Módulos por nicho | Futuro | Skills e estruturas específicas por segmento |

# VibeFly — Checklist de Compliance & Integração Meta

> Documento completo de conformidade para operar com a Meta Platform API.
> Cada item deve ser concluído antes do lançamento em produção.

---

## 1. Facebook App — Criação e Configuração Básica

- [X] Criar conta de desenvolvedor em developers.facebook.com
- [X] Criar Facebook App do tipo **Business**
- [X] Vincular o App a um **Meta Business Manager** verificado
- [X] Preencher **App Display Name** (VibeFly)
- [X] Preencher **App Contact Email** (email oficial da empresa)
- [X] Criar **email corporativo** dedicado → `contato@vibefly.app`
- [X] Atualizar email corporativo na **Privacy Policy** e **Terms of Service**
- [X] Atualizar email corporativo no **Facebook App Settings** (App Contact Email)
- [X] Preencher **App Icon** (logo VibeFly 1024x1024)
- [X] Configurar **App Domains** (`vibefly.app` — localhost não precisa, é automático em dev mode)
- [X] Definir **Privacy Policy URL** → `https://www.vibefly.app/terms`
- [X] Definir **Terms of Service URL** → `https://www.vibefly.app/privacy`
- [X] Definir **Data Deletion Request URL** → `https://www.vibefly.app/data-deletion`
- [X] Anotar e armazenar com segurança o **App ID** (`1330746402408443`) e **App Secret**

---

## 2. Facebook Login — Configuração OAuth

- [X] Adicionar produto **Facebook Login for Business** ao App
- [X] Configurar **Valid OAuth Redirect URIs**:
  - [X] URI de produção: `https://www.vibefly.app/api/auth/facebook/callback`
  - [X] URI de desenvolvimento: automático em dev mode (localhost não precisa ser adicionado)
- [X] Habilitar **Client OAuth Login**: Yes
- [X] Habilitar **Web OAuth Login**: Yes
- [X] Desabilitar **Embedded Browser OAuth Login**: Não (desabilitado)
- [X] Habilitar **Enforce HTTPS**: Sim
- [X] Confirmar que **Login com SDK JavaScript** está desabilitado: Não (desabilitado)

---

## 3. Permissões — Solicitação e Justificativa

### Permissões Necessárias

| Permissão | Justificativa de Uso | Status |
|---|---|---|
| `public_profile` | Identificar o usuário conectado | [X] Padrão (não precisa review) |
| `ads_read` | Ler campanhas, ad sets, ads, creatives e targeting | [ ] Pendente App Review |
| `ads_management` | Criar e gerenciar campanhas, ad sets, ads, upload de imagens | [ ] Pendente App Review |
| `business_management` | Acessar Business Managers e contas de anúncio | [ ] Pendente App Review |
| `pages_manage_ads` | Criar ad creatives com object_story_spec (publicar como Page post) | [ ] Pendente App Review |
| `pages_read_engagement` | Ler páginas vinculadas a contas de anúncio | [ ] Pendente App Review |
| ~~`read_insights`~~ | ~~Removido — scope deprecado pela Meta. `ads_read` já cobre insights~~ | N/A |

### Para cada permissão acima:

- [X] Documentar o caso de uso específico dentro do VibeFly → ver [`permission-use-cases.md`](permission-use-cases.md)
- [ ] Gravar **screencast** (vídeo de 2-5 min) demonstrando como a permissão é usada
- [ ] Preparar descrição textual detalhada para o formulário de review
- [ ] Identificar quais telas/funcionalidades dependem de cada permissão

---

## 4. Business Verification (Verificação da Empresa)

- [X] Acessar **Meta Business Suite > Settings > Business Verification**
- [X] Informar dados da empresa:
  - [X] Razão social
  - [X] CNPJ
  - [X] Endereço comercial
  - [X] Telefone comercial
  - [X] Website oficial
- [X] Enviar documentos comprobatórios (pelo menos 2):
  - [X] Contrato Social / Cartão CNPJ
  - [X] Conta de serviço público em nome da empresa
  - [X] Extrato bancário empresarial
  - [X] Certidão de constituição
- [X] Verificar domínio do website via DNS TXT record ou meta tag HTML
- [X] Aguardar aprovação (prazo: 2-10 dias úteis)
- [X] Confirmar status **Verified** no Business Manager

---

## 5. App Review — Submissão

### Pré-requisitos

- [X] Business Verification concluída e aprovada
- [X] Privacy Policy publicada e acessível
- [X] Terms of Service publicados e acessíveis
- [X] Data Deletion URL configurada e funcional
- [X] App testado completamente em modo desenvolvimento
- [ ] Todos os screencasts gravados e prontos

### Processo de Submissão

- [ ] Acessar **App Review > Requests** no Facebook Developer Dashboard
- [ ] Submeter cada permissão individualmente com:
  - [ ] Descrição de como a permissão é usada
  - [ ] Screencast demonstrando o fluxo do usuário
  - [ ] Instruções de teste para o revisor da Meta
  - [ ] Conta de teste (se aplicável)
- [ ] Revisar e submeter
- [ ] Acompanhar status (prazo: 3-15 dias úteis por permissão)
- [ ] Responder a eventuais solicitações de informações adicionais
- [ ] Confirmar aprovação de todas as permissões

---

## 6. Data Use Checkup (Verificação de Uso de Dados)

> Obrigatória anualmente. Deve ser renovada para manter acesso às APIs.

### Declarações Obrigatórias

- [ ] Declarar **quais dados** são coletados via API:
  - [ ] Dados de perfil do usuário (nome, ID)
  - [ ] Dados de campanhas publicitárias
  - [ ] Dados de ad sets e ads
  - [ ] Métricas e insights de performance
  - [ ] Dados de Business Manager
  - [ ] Dados de páginas
- [ ] Declarar **como os dados são usados**:
  - [ ] Exibição em dashboard para o usuário
  - [ ] Proxy para ferramentas MCP (IA/automação)
  - [ ] Nunca para venda a terceiros
  - [ ] Nunca para marketing direcionado a outros usuários
- [ ] Declarar **como os dados são armazenados**:
  - [ ] Tokens encriptados com AES-256 via pgcrypto (Supabase)
  - [ ] Dados de campanhas não persistidos (proxy em tempo real)
  - [ ] Criativos armazenados em Cloudflare R2 (isolados por workspace)
  - [ ] Logs de uso anonimizados
- [ ] Declarar **políticas de retenção**:
  - [ ] Tokens: deletados quando usuário desconecta ou expira
  - [ ] Criativos no R2: retidos enquanto workspace ativo, deletados em 30 dias após exclusão
  - [ ] Logs de uso: retidos por 90 dias
  - [ ] Dados de perfil: retidos enquanto conta ativa
- [ ] Declarar **quem tem acesso** aos dados:
  - [ ] Apenas o próprio usuário (via workspace)
  - [ ] Admins do workspace
  - [ ] Nenhum acesso por funcionários VibeFly em produção
- [ ] Declarar **medidas de segurança**:
  - [ ] Encriptação em trânsito (HTTPS/TLS)
  - [ ] Encriptação em repouso (pgcrypto AES-256)
  - [ ] Row Level Security (RLS) no Supabase
  - [ ] API keys com hash SHA-256
  - [ ] Rate limiting por workspace
  - [ ] Storage R2 isolado por workspace_id

### Renovação

- [ ] Definir lembrete anual para renovar o Data Use Checkup
- [ ] Data da próxima renovação: ____/____/________

---

## 7. Privacy Policy — Requisitos Meta

> A Privacy Policy deve conter seções específicas exigidas pela Meta.

- [ ] Mencionar explicitamente a integração com **Facebook/Meta**
- [ ] Descrever quais dados são coletados via Facebook Login:
  - [ ] Nome e ID do perfil público
  - [ ] Permissões de acesso a Ads e Business Manager
- [ ] Descrever como os dados da Meta API são usados
- [ ] Descrever como os dados são armazenados e protegidos
- [ ] Descrever como o usuário pode **revogar acesso** (desconectar conta)
- [ ] Descrever o processo de **exclusão de dados** (Data Deletion)
- [ ] Incluir informações de contato para questões de privacidade
- [ ] Informar que os dados **não são vendidos a terceiros**
- [ ] Mencionar conformidade com a LGPD (Lei Geral de Proteção de Dados)
- [ ] Manter a policy acessível publicamente (sem login)

---

## 8. Terms of Service — Requisitos Meta

- [ ] Mencionar que o serviço integra com a **Meta Platform**
- [ ] Incluir cláusula de que o usuário concorda com os [Termos da Meta Platform](https://developers.facebook.com/terms/)
- [ ] Descrever responsabilidades do usuário sobre os dados de anúncios
- [ ] Descrever limitações do serviço (dependência da API Meta)
- [ ] Incluir cláusula de isenção de responsabilidade por mudanças na API Meta
- [ ] Manter os termos acessíveis publicamente (sem login)

---

## 9. Data Deletion — Implementação Obrigatória

> A Meta exige que o app ofereça uma forma de deletar os dados do usuário.

- [X] Implementar **Data Deletion Callback URL** ou **Data Deletion Instructions URL**
- [ ] Opção A — Callback automático:
  - [ ] Criar endpoint `POST /api/meta/data-deletion`
  - [ ] Receber `signed_request` da Meta
  - [ ] Validar assinatura com App Secret
  - [ ] Deletar token encriptado do workspace
  - [ ] Limpar dados de BM do workspace
  - [ ] Deletar criativos do R2 associados ao workspace
  - [ ] Retornar `confirmation_code` e `url` de status
- [ ] Opção B — Instruções manuais:
  - [ ] Criar página `/data-deletion` com instruções para o usuário
  - [ ] Instruções: "Vá em Dashboard > Workspace > Desconectar Meta Account"
- [ ] Configurar a URL escolhida no Facebook Developer Dashboard
- [ ] Testar o fluxo de ponta a ponta

---

## 10. Segurança Técnica — Checklist

### Tokens e Autenticação

- [ ] App Secret armazenado apenas em variáveis de ambiente server-side
- [ ] App Secret **nunca** exposto no frontend (sem prefixo `NEXT_PUBLIC_`)
- [ ] Tokens de acesso encriptados com AES-256 (pgcrypto) antes de persistir
- [ ] Chave de encriptação (`TOKEN_ENCRYPTION_KEY`) armazenada em env var segura
- [ ] State parameter CSRF com 32 bytes random em cookie HttpOnly
- [ ] Cookie OAuth com flags: HttpOnly, SameSite=Lax, Secure (prod), Max-Age=600s
- [ ] Token exchange realizado exclusivamente server-side
- [ ] Redirect URI fixa e validada contra o registrado no Facebook

### Proteção de Dados

- [ ] Row Level Security (RLS) habilitado em todas as tabelas
- [ ] Tokens nunca retornados ao frontend (campo `encrypted_token` excluído dos selects)
- [ ] API keys armazenadas como hash SHA-256 (nunca em texto puro)
- [ ] Rate limiting implementado por workspace
- [ ] Logs de uso não contêm tokens ou dados sensíveis

### Storage R2

- [ ] Bucket isolado por workspace via path prefix (`{workspace_id}/`)
- [ ] Acesso ao R2 autenticado via service binding (não público por padrão)
- [ ] URLs de acesso temporárias (signed URLs) com expiração
- [ ] Limites de storage por plano enforced na aplicação
- [ ] Cleanup automático de assets órfãos (cron mensal)

### Infraestrutura

- [ ] HTTPS obrigatório em produção
- [ ] Headers de segurança configurados (HSTS, CSP, X-Frame-Options)
- [ ] Variáveis sensíveis nunca commitadas no repositório
- [ ] `.env.local` no `.gitignore`
- [ ] Secrets da Supabase Edge Function configurados via dashboard (não no código)

---

## 11. Upload de Criativos — Fluxo e Limites

### Fluxo de Upload de Imagens

```
LLM (base64 ou URL) → MCP Worker → R2 (salva) → Meta API (bytes ou url)
                                                 → Retorna image_hash
```

- [ ] `upload_ad_image` aceita `image_base64` (do chat) e `image_url` (link público)
- [ ] Imagem salva no R2 em `{workspace_id}/images/{timestamp}_{name}.{ext}`
- [ ] Formatos aceitos: JPG, PNG (recomendado 1200x628px)
- [ ] Tamanho máximo: 30MB
- [ ] Meta retorna `image_hash` para uso em `create_ad_creative`

### Fluxo de Upload de Vídeos

```
LLM (base64 ou URL) → MCP Worker → R2 (salva) → URL pública R2 → Meta API (file_url)
                                                                  → Retorna video_id
```

- [ ] `upload_ad_video` aceita `video_base64` (do chat) e `video_url` (link público)
- [ ] Vídeo salvo no R2 em `{workspace_id}/videos/{timestamp}_{name}.{ext}`
- [ ] Formatos aceitos: MP4, MOV (H.264, AAC)
- [ ] Tamanho máximo: 500MB (Pro), 2GB (Enterprise)
- [ ] Upload assíncrono: Meta retorna `video_id` e processa em background
- [ ] Polling de status necessário até `ready`

### Limites por Plano

| Recurso | Free | Pro ($49/mês) | Enterprise ($199/mês) |
|---|---|---|---|
| Upload de imagens | Nenhum | 50/dia por workspace | Ilimitado |
| Upload de vídeos | Nenhum | 10/dia por workspace | 100/dia por workspace |
| Storage R2 | — | 1GB por workspace | 10GB por workspace |
| Tamanho max imagem | — | 30MB | 30MB |
| Tamanho max vídeo | — | 500MB | 2GB |

### Limites da Meta API para Uploads

| Recurso | Limite Meta |
|---|---|
| Upload de imagens por chamada | ~50 imagens em batch |
| Upload de imagens (rate limit) | ~200 chamadas/hora (compartilhado) |
| Tamanho máximo de imagem | 30MB |
| Upload de vídeo via API | 1GB max (single), 10GB (chunked) |
| Processamento de vídeo | Assíncrono, pode levar minutos |

---

## 12. Meta Platform Terms Compliance

> Regras adicionais que a Meta exige de todos os apps que usam suas APIs.

- [ ] **Não armazenar dados da API** além do necessário para funcionalidade imediata
- [ ] **Não compartilhar tokens** de acesso entre usuários ou workspaces
- [ ] **Não usar dados** da API para vigilância, discriminação ou propósitos ilegais
- [ ] **Não reconstruir** o perfil de usuários além do que é exibido ao próprio usuário
- [ ] **Não fazer scraping** — usar apenas endpoints oficiais da Graph API
- [ ] **Respeitar rate limits** da Meta API (além dos nossos próprios)
- [ ] **Manter a API atualizada** — migrar para novas versões antes da deprecação
- [ ] **Exibir branding correto** — usar o logo do Facebook conforme as [Brand Guidelines](https://about.meta.com/brand/resources/facebook/logo/)
- [ ] **Não usar "Facebook" no nome do app** de forma que sugira endorsement oficial

---

## 13. LGPD — Conformidade Brasileira

- [ ] Definir **base legal** para tratamento de dados (consentimento do usuário via OAuth)
- [ ] Nomear um **Encarregado de Dados (DPO)** ou ponto de contato
- [ ] Implementar mecanismo de **consentimento explícito** (o OAuth flow já serve)
- [ ] Implementar mecanismo de **revogação de consentimento** (desconectar conta)
- [ ] Implementar **direito de acesso** — usuário pode ver quais dados temos
- [ ] Implementar **direito de exclusão** — usuário pode solicitar remoção dos dados
- [ ] Implementar **direito de portabilidade** — exportar dados em formato legível
- [ ] Registrar **atividades de tratamento de dados** (registro interno)
- [ ] Avaliar necessidade de **Relatório de Impacto à Proteção de Dados (RIPD)**
- [ ] Incluir informações de contato do DPO na Privacy Policy

---

## 14. Rate Limits — Meta API (Referência)

### Rate Limiting Geral — Por App

| Recurso | Limite | Janela |
|---|---|---|
| Chamadas à API | 200 x número de usuários do app | Por hora |
| Mínimo garantido | 200 chamadas/hora | Por hora |

### Ads API — Tiers de Acesso

| Tier | Gasto mensal da conta | Rate limit |
|---|---|---|
| Development | Qualquer (app em dev mode) | ~200 chamadas/hora |
| Basic | Qualquer (app aprovado) | ~200 chamadas/hora |
| Standard | > $10K/mês de ad spend | ~1.000 chamadas/hora |
| Advanced | Negociado com Meta | Limites customizados |

### Custo por Endpoint

| Endpoint | Custo relativo |
|---|---|
| `GET /campaigns`, `/adsets`, `/ads` | Baixo (1x) |
| `POST` (criar/editar) | Médio (2-3x) |
| `GET /insights` | Alto (10-50x dependendo de breakdowns) |
| `POST /adimages` (upload) | Médio (2x) |
| `POST /advideos` (upload) | Médio (2x) |
| `debug_token` | Limite separado, mais generoso |

### Headers de Controle

- `X-Business-Use-Case-Usage` — retornado em cada resposta com uso atual
- HTTP 429 — quando o limite é atingido
- `X-App-Usage` — percentual de uso do app-level limit

---

## 15. Planos VibeFly — Limites Internos (Referência)

### Visão Geral

| Recurso | Free ($0) | Pro ($49/mês) | Enterprise ($199/mês) |
|---|---|---|---|
| Workspaces | 1 | 5 | 50 |
| API keys | 1 | 5 | 20 |
| Chamadas/dia | 200 | 5.000 | 50.000 |
| Chamadas/min | 10 | 60 | 300 |
| Ferramentas | Somente leitura (28) | Todas (leitura + escrita) | Todas + custom |
| Upload imagens | Nenhum | 50/dia por workspace | Ilimitado |
| Upload vídeos | Nenhum | 10/dia por workspace | 100/dia por workspace |
| Storage R2 | — | 1GB/workspace | 10GB/workspace |
| Membros | 1 (owner) | 5 | Ilimitado |
| Suporte | Comunidade | Prioritário (email) | Dedicado (Slack/call) |
| SSO & Audit Logs | Não | Não | Sim |
| SLA | — | — | 99.9% uptime |

---

## 16. Monitoramento Contínuo

- [ ] Configurar **alerta** para quando tokens forem invalidados
- [ ] Configurar **alerta** para falhas no token health check
- [ ] Monitorar **Data Use Checkup** — renovar anualmente
- [ ] Monitorar **App Review** — resubmeter se novas permissões forem necessárias
- [ ] Monitorar **Meta API changelog** — migrar antes de versões serem deprecadas
- [ ] Monitorar **uso do R2** — alertar quando storage atingir 80% do limite do plano
- [ ] Revisar **Privacy Policy** a cada 6 meses ou quando houver mudanças no produto
- [ ] Revisar **Terms of Service** a cada 6 meses ou quando houver mudanças no produto
- [ ] Manter registro de **incidentes de segurança** (se houver)
- [ ] Notificar a Meta em até **72 horas** em caso de violação de dados

---

## Resumo de Status

| Área | Status | Responsável | Prazo |
|---|---|---|---|
| Facebook App Setup | ⬜ Pendente | | |
| Facebook Login Config | ⬜ Pendente | | |
| Business Verification | ⬜ Pendente | | |
| App Review | ⬜ Pendente | | |
| Data Use Checkup | ⬜ Pendente | | |
| Privacy Policy Update | ⬜ Pendente | | |
| Terms of Service Update | ⬜ Pendente | | |
| Data Deletion | ⬜ Pendente | | |
| Segurança Técnica | ⬜ Pendente | | |
| Upload de Criativos (R2) | ⬜ Pendente | | |
| LGPD | ⬜ Pendente | | |
| Monitoramento | ⬜ Pendente | | |

---

*Última atualização: 2026-04-01*

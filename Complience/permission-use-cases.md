# VibeFly — Casos de Uso das Permissões Meta API

> Documentação detalhada de como cada permissão da Meta Platform API é utilizada no VibeFly.
> Para uso no formulário de App Review da Meta.

---

## 1. `ads_read`

**Resumo**: Permite que os usuários do VibeFly visualizem e analisem suas campanhas publicitárias existentes no Meta Ads diretamente via ferramentas de IA (MCP).

### Casos de Uso

1. **Listar contas de anúncio** — O usuário conecta sua conta Meta e o VibeFly lista todas as contas de anúncio (`/me/adaccounts`) para que ele escolha qual gerenciar.

2. **Visualizar campanhas** — O usuário pede ao assistente IA para listar suas campanhas ativas. O VibeFly consulta `/{account_id}/campaigns` e retorna nome, status, objetivo e orçamento de cada campanha.

3. **Visualizar ad sets** — O usuário consulta os conjuntos de anúncios de uma campanha específica via `/{campaign_id}/adsets`, incluindo targeting, orçamento, schedule e status.

4. **Visualizar anúncios** — O usuário consulta os anúncios individuais via `/{adset_id}/ads` ou `/{account_id}/ads`, incluindo status, creative e configurações de entrega.

5. **Consultar detalhes de criativos** — O usuário visualiza os criativos associados a um anúncio (`/{ad_id}/adcreatives`), incluindo imagens, vídeos, textos e call-to-action.

6. **Analisar performance (Insights)** — O usuário pede métricas de performance como impressões, cliques, CTR, CPC, gastos e conversões via `/{object_id}/insights`, com filtros de data e breakdowns por idade, gênero, plataforma ou país.

7. **Pesquisar targeting** — O usuário pesquisa interesses (`/search?type=adinterest`), comportamentos (`/search?type=adTargetingCategory&class=behaviors`), dados demográficos e localizações geográficas para planejar a segmentação de campanhas.

8. **Estimar audiência** — O usuário estima o tamanho de uma audiência com base em critérios de targeting via `/{account_id}/reachestimate`.

9. **Pesquisar biblioteca de anúncios** — O usuário pesquisa anúncios públicos no Meta Ad Library (`/ads_archive`) para análise competitiva.

### Telas/Funcionalidades que Dependem

- Dashboard principal (listagem de campanhas, ad sets e ads)
- Painel de insights e métricas de performance
- Ferramenta de pesquisa de targeting e audiência
- Pesquisa na biblioteca de anúncios (Ad Library)
- Todas as ferramentas MCP de leitura (28 ferramentas no plano Free)

### Endpoints da Graph API Utilizados

| Endpoint | Operação |
|---|---|
| `GET /me/adaccounts` | Listar contas de anúncio do usuário |
| `GET /{account_id}` | Detalhes de uma conta de anúncio |
| `GET /{account_id}/campaigns` | Listar campanhas |
| `GET /{campaign_id}` | Detalhes de uma campanha |
| `GET /{account_id}/adsets` | Listar ad sets por conta |
| `GET /{campaign_id}/adsets` | Listar ad sets por campanha |
| `GET /{adset_id}` | Detalhes de um ad set |
| `GET /{account_id}/ads` | Listar ads por conta |
| `GET /{campaign_id}/ads` | Listar ads por campanha |
| `GET /{adset_id}/ads` | Listar ads por ad set |
| `GET /{ad_id}` | Detalhes de um anúncio |
| `GET /{ad_id}/adcreatives` | Listar criativos de um anúncio |
| `GET /{creative_id}` | Detalhes de um criativo |
| `GET /act_{account_id}/adimages` | Obter URL de imagem por hash |
| `GET /{video_id}` | Detalhes de um vídeo |
| `GET /{object_id}/insights` | Métricas de performance |
| `GET /search?type=adinterest` | Pesquisar interesses |
| `GET /search?type=adinterestsuggestion` | Sugestões de interesses |
| `GET /search?type=adTargetingCategory` | Pesquisar comportamentos/demográficos |
| `GET /search?type=adgeolocation` | Pesquisar localizações |
| `GET /{account_id}/reachestimate` | Estimar tamanho de audiência |
| `GET /ads_archive` | Pesquisar biblioteca de anúncios |

---

## 2. `ads_management`

**Resumo**: Permite que os usuários do VibeFly criem e gerenciem campanhas publicitárias no Meta Ads via assistente IA (MCP), incluindo upload de imagens e vídeos.

### Casos de Uso

1. **Criar campanha** — O usuário instrui o assistente IA a criar uma nova campanha publicitária, especificando objetivo (CONVERSIONS, TRAFFIC, etc.), nome e orçamento. O VibeFly faz POST em `/{account_id}/campaigns`.

2. **Atualizar campanha** — O usuário pede para alterar nome, status (ACTIVE/PAUSED), orçamento ou configurações de uma campanha existente via POST em `/{campaign_id}`.

3. **Criar ad set** — O usuário cria um conjunto de anúncios com targeting específico (idade, gênero, interesses, localização), orçamento diário/total, schedule e posicionamento. POST em `/{account_id}/adsets`.

4. **Atualizar ad set** — O usuário modifica targeting, orçamento, schedule ou status de um ad set existente via POST em `/{adset_id}`.

5. **Criar anúncio** — O usuário cria um anúncio vinculando um criativo a um ad set via POST em `/{account_id}/ads`.

6. **Atualizar anúncio** — O usuário altera status, nome ou criativo de um anúncio existente via POST em `/{ad_id}`.

7. **Upload de imagem** — O usuário envia uma imagem (base64 ou URL) para usar em criativos. O VibeFly faz upload via POST em `/{account_id}/adimages` e recebe um `image_hash`.

8. **Upload de vídeo** — O usuário envia um vídeo (base64 ou URL) para usar em criativos. O VibeFly faz upload via POST em `/{account_id}/advideos` e recebe um `video_id`.

9. **Criar criativo** — O usuário cria um ad creative com imagem ou vídeo, textos, headline, link e call-to-action via POST em `/{account_id}/adcreatives`.

10. **Atualizar criativo** — O usuário renomeia um criativo existente via POST em `/{creative_id}`.

11. **Criar budget schedule** — O usuário cria um agendamento de orçamento para uma campanha via POST em `/{campaign_id}/budget_schedules`.

### Restrição de Acesso por Plano

- **Free**: Sem acesso a ferramentas de escrita. Retorna erro orientando upgrade.
- **Pro ($49/mês)**: Acesso completo a todas as operações de criação e edição.
- **Enterprise ($199/mês)**: Acesso completo com limites ampliados de upload.

### Telas/Funcionalidades que Dependem

- Criação de campanhas via assistente IA
- Edição e gestão de campanhas, ad sets e ads
- Upload de imagens e vídeos para criativos
- Criação de ad creatives com imagem ou vídeo
- Agendamento de orçamento

### Endpoints da Graph API Utilizados

| Endpoint | Operação |
|---|---|
| `POST /{account_id}/campaigns` | Criar campanha |
| `POST /{campaign_id}` | Atualizar campanha |
| `POST /{account_id}/adsets` | Criar ad set |
| `POST /{adset_id}` | Atualizar ad set |
| `POST /{account_id}/ads` | Criar anúncio |
| `POST /{ad_id}` | Atualizar anúncio |
| `POST /{account_id}/adimages` | Upload de imagem |
| `POST /{account_id}/advideos` | Upload de vídeo |
| `POST /{account_id}/adcreatives` | Criar criativo |
| `POST /{creative_id}` | Atualizar criativo |
| `POST /{campaign_id}/budget_schedules` | Criar budget schedule |

---

## 3. `business_management`

**Resumo**: Permite que o VibeFly acesse os Business Managers do usuário e liste as contas de anúncio associadas, para que o usuário possa gerenciar múltiplas contas de diferentes Business Managers.

### Casos de Uso

1. **Listar Business Managers** — Após o login OAuth, o VibeFly consulta `/me/businesses` para descobrir todos os Business Managers que o usuário administra.

2. **Listar contas de anúncio por Business Manager** — Para cada Business Manager, o VibeFly consulta `/{bm_id}/owned_ad_accounts` para listar as contas de anúncio disponíveis. O usuário então seleciona quais contas deseja conectar ao workspace.

3. **Pesquisar Business Managers** — O usuário pode pesquisar seus Business Managers por nome via `/me/businesses` com filtro de nome.

### Fluxo de Conexão

```
Login OAuth → /me/businesses → lista BMs
           → /{bm_id}/owned_ad_accounts (para cada BM) → lista contas
           → Usuário seleciona contas → Salva no workspace
```

### Telas/Funcionalidades que Dependem

- Tela de conexão de conta Meta (onboarding)
- Seleção de Business Manager e contas de anúncio
- Pesquisa de Business Managers no dashboard

### Endpoints da Graph API Utilizados

| Endpoint | Operação |
|---|---|
| `GET /me/businesses` | Listar Business Managers do usuário |
| `GET /{bm_id}/owned_ad_accounts` | Listar contas de anúncio do BM |

---

## 4. `pages_manage_ads`

**Resumo**: Permite que o VibeFly crie ad creatives vinculados a Facebook Pages do usuário, necessário para publicar anúncios que aparecem como posts da página.

### Casos de Uso

1. **Criar criativo com imagem vinculado a uma página** — O usuário cria um ad creative com `object_story_spec` contendo `page_id`, `link_data` (imagem, link, mensagem, headline, call-to-action). O anúncio aparece no feed como um post da página selecionada.

2. **Criar criativo com vídeo vinculado a uma página** — O usuário cria um ad creative com `object_story_spec` contendo `page_id`, `video_data` (vídeo, mensagem, headline, link, call-to-action). O anúncio aparece como um vídeo publicado pela página.

3. **Criar criativo com posicionamento no Instagram** — Opcionalmente, o usuário pode incluir `instagram_actor_id` no criativo para que o anúncio também apareça no Instagram vinculado à página.

### Por que é Necessário

A Meta exige que todo anúncio no feed seja publicado "em nome de" uma Facebook Page. O `object_story_spec` é a estrutura que vincula o criativo à página. Sem `pages_manage_ads`, não é possível criar criativos com essa estrutura.

### Telas/Funcionalidades que Dependem

- Criação de ad creatives (imagem e vídeo)
- Fluxo completo de criação de anúncios via assistente IA

### Endpoints da Graph API Utilizados

| Endpoint | Operação |
|---|---|
| `POST /{account_id}/adcreatives` | Criar criativo com `object_story_spec` contendo `page_id` |

---

## 5. `pages_read_engagement`

**Resumo**: Permite que o VibeFly leia as Facebook Pages do usuário para que ele possa selecionar qual página usar ao criar anúncios.

### Casos de Uso

1. **Listar páginas do usuário** — O VibeFly lista as Facebook Pages que o usuário administra via `/me/accounts`, exibindo nome, categoria, número de seguidores e status de verificação.

2. **Listar páginas da conta de anúncio** — O VibeFly também consulta `/{account_id}/owned_pages` para encontrar páginas vinculadas diretamente à conta de anúncio.

3. **Pesquisar páginas promotáveis** — Ao criar um criativo, o usuário pode pesquisar entre suas páginas promotáveis (`/{account_id}/promote_pages`) para selecionar qual página associar ao anúncio.

### Por que é Necessário

Para criar um ad creative, o usuário precisa informar o `page_id`. Esta permissão permite que o VibeFly liste as páginas disponíveis para que o usuário selecione a correta, em vez de pedir que ele forneça o ID manualmente.

### Telas/Funcionalidades que Dependem

- Listagem de páginas no dashboard
- Seleção de página ao criar criativos
- Pesquisa de páginas promotáveis

### Endpoints da Graph API Utilizados

| Endpoint | Operação |
|---|---|
| `GET /me/accounts` | Listar páginas do usuário |
| `GET /{account_id}/owned_pages` | Listar páginas da conta de anúncio |
| `GET /{account_id}/promote_pages` | Listar páginas promotáveis (com filtro de nome) |

---

## Resumo de Permissões × Funcionalidades

| Permissão | Plano Free | Plano Pro | Plano Enterprise |
|---|---|---|---|
| `ads_read` | Leitura completa (28 ferramentas) | Leitura completa | Leitura completa |
| `ads_management` | Bloqueado | Escrita completa (11 ferramentas) | Escrita completa |
| `business_management` | Listar BMs e contas | Listar BMs e contas | Listar BMs e contas |
| `pages_manage_ads` | Bloqueado | Criar criativos | Criar criativos |
| `pages_read_engagement` | Listar páginas | Listar páginas | Listar páginas |

---

*Documento gerado em: 2026-04-02*
*Versão da Meta Graph API: v24.0*

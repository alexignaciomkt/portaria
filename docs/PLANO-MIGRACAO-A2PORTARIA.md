# PLANO DE MIGRAÇÃO E TRANSIÇÃO — A2PORTARIA INDEPENDENTE
**Documento Técnico de Infraestrutura e Implantação**  
**Versão:** 1.0.0  
**Data:** 15 de Outubro de 2026  
**Responsável Técnico:** CTO, Arquiteto de Software e Engenheiro Full Stack Sênior  
**Domínio Alvo:** `https://portaria.a2tickets360.com.br`  
**Projeto Vercel Atual:** `a2tickets360` (`prj_cxPsKit866Kwwy05zfSsol7ZKsde`)  
**Novo Projeto Vercel:** `portaria` (`prj_a4FHJYZJSwKV6kCYLdYkEskRRVgj`)  
**Equipe Vercel:** `team_faBuyMHpkAPC1axXeY58m2f4`  

---

## 1. OBJETIVO DA MIGRAÇÃO

Migrar o frontend da Portaria do atual subdomínio dentro do monorepo `a2tickets360` para o novo projeto independente `portaria` na Vercel, garantindo:
1. **Zero Downtime** para os usuários e portarias ativas.
2. **Nenhum impacto** no site de vendas e portal do produtor `www.a2tickets360.com.br`.
3. **Isolamento de builds** (um deploy da portaria não recompila o portal de vendas, e vice-versa).
4. **Resolução de API Same-Origin** via rewrites na Vercel (`/api/* -> https://api.a2tickets360.com.br/api/*`), eliminando problemas de CORS e Mixed Content em navegadores móveis (Samsung Internet, Chrome Android, Safari iOS).

---

## 2. ETAPAS DE TRANSIÇÃO (EXECUÇÃO CONTROLADA)

### Etapa 1: Preparação do Repositório GitHub
- Repositório: `https://github.com/alexignaciomkt/portaria.git`
- Branch principal: `main`
- Conteúdo: Frontend React + Vite independente, com build 100% testado e aprovado.
- Commit inicial limpo (sem arquivos sensíveis ou node_modules).

### Etapa 2: Configuração do Projeto na Vercel
No projeto já criado `prj_a4FHJYZJSwKV6kCYLdYkEskRRVgj` (`portaria`):
1. **Vincular ao Repositório GitHub:** `alexignaciomkt/portaria`.
2. **Definir Framework Preset:** `Vite`.
3. **Definir Build Command:** `npm run build` (ou `vite build`).
4. **Definir Output Directory:** `dist`.
5. **Configurar Variáveis de Ambiente:**
   - `VITE_API_URL` = `https://api.a2tickets360.com.br`
   - `VITE_SUPABASE_URL` = URL do Supabase compartilhado
   - `VITE_SUPABASE_ANON_KEY` = Chave pública anon do Supabase

### Etapa 3: Homologação em URL Temporária da Vercel
1. Disparar primeiro deploy de preview/produção para gerar a URL `portaria-*.vercel.app`.
2. Acessar via smartphone (Samsung Android) com câmera física conectada via HTTPS.
3. Testar leitura de QR Code `CRED-` e `TKT_`.
4. Verificar feedback de som e semáforo.

### Etapa 4: Desacoplamento e Apontamento do Domínio Oficial
**Apenas após aprovação expressa do proprietário:**
1. No projeto `a2tickets360` (`prj_cxPsKit866Kwwy05zfSsol7ZKsde`):
   - Remover o domínio `portaria.a2tickets360.com.br`.
2. No projeto `portaria` (`prj_a4FHJYZJSwKV6kCYLdYkEskRRVgj`):
   - Adicionar o domínio `portaria.a2tickets360.com.br`.
3. A Vercel reatribuirá os certificados TLS/SSL automaticamente em menos de 60 segundos, sem necessidade de alteração de DNS no provedor (DNS CNAME já aponta para `cname.vercel-dns.com`).

---

## 3. PLANO DE ROLLBACK (DESFAZIMENTO IMEDIATO)

Caso ocorra qualquer comportamento anômalo após a transferência do domínio:
1. No projeto `portaria`, remover o domínio `portaria.a2tickets360.com.br`.
2. No projeto `a2tickets360`, readicionar o domínio `portaria.a2tickets360.com.br`.
3. O tráfego retornará imediatamente para as rotas legadas do monorepo.
4. Tempo estimado de restauração: **< 2 minutos**.

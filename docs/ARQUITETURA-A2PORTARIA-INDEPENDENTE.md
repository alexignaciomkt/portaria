# ARQUITETURA A2PORTARIA — SISTEMA INDEPENDENTE DE OPERAÇÕES DE ACESSO
**Documento Oficial de Arquitetura e Engenharia**  
**Versão:** 1.0.0  
**Data:** 15 de Outubro de 2026  
**Responsável:** CTO, Arquiteto de Software e Engenheiro Full Stack Sênior  
**Repositório Independente:** `https://github.com/alexignaciomkt/portaria.git` (`E:\dev\portaria`)  
**Ecosistema:** A2Tickets360, A2Sports360, A2Staff, A2Expositores  

---

## 1. VISÃO GERAL E DIRETRIZ ESTRATÉGICA

A **A2Portaria** é concebida como um sistema operacional independente e desacoplado, atuando como o ponto central de controle de acesso, recepção e credenciamento físico para todos os produtos do **Ecossistema A2**.

Diferente de um simples leitor de QR Code ou de uma página interna do A2Tickets360, a A2Portaria constitui uma aplicação autônoma de alta performance, projetada para funcionar com baixíssima latência na ponta (dispositivos móveis, coletores de dados, tablets e totens), com suporte a operações offline transitórias, resiliência contra instabilidade de rede e segurança de nível corporativo.

```
                      +-----------------------------+
                      |         A2PORTARIA          |
                      |   (Aplicação Independente)  |
                      +--------------+--------------+
                                     |
    +--------------------------------+--------------------------------+
    |                                |                                |
    v                                v                                v
+------------------+       +------------------+       +------------------+
|   A2Tickets360   |       |   A2Sports360    |       |   Módulos Exp.   |
| (Staff/Ingressos)|       | (Kits / Atletas) |       | (Expositores)    |
+------------------+       +------------------+       +------------------+
```

---

## 2. O PRINCÍPIO FUNDAMENTAL DA PORTARIA UNIVERSAL

Para evitar replicação de lógica e garantir que novos casos de uso possam ser incorporados sem reescrever interfaces ou scanners, a A2Portaria adota o pipeline universal estrito de 5 etapas:

```
[ IDENTIFICAR ]
       │
       ▼
[ AUTORIZAR ]
       │
       ▼
[ EXECUTAR ]
       │
       ▼
[ AUDITAR ]
       │
       ▼
[ NOTIFICAR ]
```

### 2.1 Detalhamento das Etapas

1. **IDENTIFICAR:**
   - Captura do payload via câmera (HTML5 QR Code), entrada manual de código ou leitor laser serial/bluetooth.
   - Classificação imediata do tipo de credencial através de prefixos canônicos e padrões:
     - `CRED-`: Credencial operacional de Staff ou Funcionário.
     - `TKT_`: Ingresso de participante/consumidor de evento.
     - `EXH-`: Credencial de expositor/montador (futuro).
     - `ATH-`: Inscrição/Kit de atleta em campeonato A2Sports (futuro).
     - `TAB-`: Controle e abertura de mesas de jogos/competições (futuro).

2. **AUTORIZAR:**
   - Avaliação do contexto de segurança:
     - Quem é o operador logado? (Extraído do JWT verificado).
     - Qual é a função/papel do operador no evento selecionado?
     - O operador possui permissão delegada para autorizações especiais (`staff.attendance.early_authorize`, `staff.attendance.delegate`)?
     - A credencial é válida para o evento e fuso horário oficial (`America/Sao_Paulo`)?
     - Existe foto cadastrada obrigatória para o profissional?

3. **EXECUTAR:**
   - Despacho da operação ao motor operacional correspondente:
     - Validação/consumo de ingresso de público geral.
     - Check-in de staff no turno sugerido ou selecionado manualmente.
     - Registro de checkout do profissional com encerramento de escala.
     - Homologação segura via flag `scanOnly` quando em modo de auditoria ou treinamento.
     - Travamento transacional atômico via `pg_advisory_xact_lock` para prevenção de double scan / concorrência.

4. **AUDITAR:**
   - Registro imutável de todas as leituras e decisões operacionais:
     - `operatorUserId`: Identidade do operador autenticado.
     - `authorizedByUserId`: Identidade de quem aprovou caso seja entrada antecipada.
     - `correlationId`: Identificador único da transação ponta a ponta.
     - `earlyMinutes`: Minutos de antecipação em relação ao início do turno.
     - `reasonCode`: Código semântico de aprovação ou bloqueio.

5. **NOTIFICAR:**
   - Feedback multimodal imediato para o operador e para o usuário:
     - **Visual (Semáforo Inteligente):** 🟢 Verde (Autorizado), 🟡 Amarelo (Ação Requerida), 🔴 Vermelho (Bloqueado), ⚪ Neutro (Indeterminado/Falha de Rede).
     - **Sonoro:** Síntese de áudio Web Audio API (frequências puras de confirmação, alerta, rejeição e neutro), com controle de mudo e volume seguro.
     - **Tátil:** Vibração háptica nos smartphones suportados.

---

## 3. ARQUITETURA DO FRONTEND INDEPENDENTE

### 3.1 Stack Tecnológica
- **Framework:** React 18 + TypeScript 5 (Vite 5).
- **Roteamento:** React Router DOM v6 com roteamento canônico:
  - `/login`: Autenticação limpa e dedicada para operadores de portaria.
  - `/redefinir-senha`: Recuperação de credencial.
  - `/app`: Painel do operador (seleção de evento ativo e métricas rápidas).
  - `/:slug/scanner`: Terminal do Scanner Universal.
- **Estilização:** Tailwind CSS + Radix UI Primitives (Toasts, Cards, Buttons, Avatars).
- **Scanner:** `html5-qrcode` com ciclo de vida defensivo, reconexão automática e tolerância a rotação/foco.
- **Porta Local:** `8082` (evitando conflito com A2Tickets360 `8081` e A2Sports360 `3000`).

### 3.2 Isolamento e Segurança
- Nenhuma chave privilegiada (`SUPABASE_SERVICE_ROLE_KEY` ou segredos de banco) está presente no frontend.
- O cliente utiliza estritamente `VITE_SUPABASE_ANON_KEY` para autenticação de sessão e tokens de curta duração.
- O token JWT é armazenado em `localStorage` e renovado preventivamente com timeout de segurança antes de expirar.

---

## 4. INTEGRAÇÃO E CONTRATOS DE BACKEND

Para permitir entrada em produção célere e segura sem duplicação de regras de negócio, a A2Portaria reutiliza os contratos estabelecidos na API do ecossistema:

1. `POST /api/credentials/validate`:
   - Identificação do portador da credencial (`CRED-`).
   - Resolução de foto real, escalas ativas, turnos do dia e turnos futuros.
   - Retorno enriquecido com `StaffShiftItem[]` e `isSuggested`.

2. `POST /api/credentials/confirm`:
   - Confirmação atômica de check-in no turno escolhido.
   - Validação de delegação caso seja entrada antecipada (`earlyAuthorization`).

3. `POST /api/credentials/checkout`:
   - Registro de saída atômico com encerramento de presença.

4. `POST /api/ticket-checkin/validate`:
   - Validação e baixa de ingressos de público (`TKT_`).

5. `GET /api/portaria/operational-status`:
   - Verificação do estado operacional do evento, contadores de público e staff em serviço.

---

## 5. CASOS DE USO FUTUROS PREVISTOS

1. **A2Sports360 (Corridas e Campeonatos):**
   - Check-in de atletas na entrega de chips/kits.
   - Confirmação de entrada de árbitros e mesários de quadra.
2. **A2Expositores (Feiras e Convenções):**
   - Controle de montadores e promotores de estande durante dias de montagem/desmontagem.
3. **Modo Offline com Sincronização em Lote:**
   - Cache de ingressos validados via Service Worker / IndexedDB para locais com total ausência de sinal de internet.

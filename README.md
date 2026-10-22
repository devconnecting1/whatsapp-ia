# WhatsApp com IA (WhatsAI)

Painel local, no estilo WhatsApp, para ler e responder suas conversas pelo navegador e deixar uma IA responder clientes automaticamente. A conexão é feita com o seu WhatsApp pessoal por QR Code, usando **Baileys** (protocolo não oficial do WhatsApp Web), e a IA usa qualquer API compatível com OpenAI.

O projeto foi feito para rodar **no seu computador**, sem Docker e sem banco de dados externo. O painel escuta apenas em `127.0.0.1` e os dados ficam na pasta `data/`.

> **Leia antes de usar:** o Baileys não é oficial. Usar automação não oficial pode violar os Termos do WhatsApp e resultar em **restrição ou banimento do número**. Teste com um número secundário e leia a seção [Aviso importante](#aviso-importante). Para uso comercial/produção, use a API oficial da Meta.

---

## Índice

1. [O que é](#o-que-é)
2. [Recursos](#recursos)
3. [Como funciona](#como-funciona)
4. [Arquitetura de pastas](#arquitetura-de-pastas)
5. [Pré-requisitos](#pré-requisitos)
6. [Instalação](#instalação)
7. [Como executar](#como-executar)
8. [Como conectar o WhatsApp](#como-conectar-o-whatsapp)
9. [Como configurar a IA](#como-configurar-a-ia)
10. [Como a resposta automática funciona](#como-a-resposta-automática-funciona)
11. [Segurança e privacidade](#segurança-e-privacidade)
12. [Aviso importante](#aviso-importante)
13. [Solução de problemas](#solução-de-problemas)
14. [Estrutura de dados](#estrutura-de-dados)
15. [Endpoints principais](#endpoints-principais)
16. [Limitações conhecidas](#limitações-conhecidas)

---

## O que é

O **WhatsAI** é um painel web que roda na sua máquina e se conecta à sua conta do WhatsApp como se fosse um dispositivo conectado (WhatsApp Web). Nele você pode:

- ver a lista de conversas e o histórico disponível;
- enviar mensagens de texto e arquivos;
- ligar uma IA para responder mensagens recebidas automaticamente;
- assumir o atendimento a qualquer momento, pausando a IA.

É um projeto **pessoal e em beta**, indicado para aprendizado, testes e atendimento pequeno em um único computador. Não é um produto oficial do WhatsApp/Meta nem um serviço de nuvem. O computador precisa estar ligado e com internet para o painel e a IA funcionarem.

---

## Recursos

- **Conexão por QR Code** com o WhatsApp pessoal, no modelo de dispositivo conectado.
- **Sessão persistente** em `data/auth`: depois da primeira leitura, o painel tenta reconectar sozinho ao reiniciar.
- **Lista de conversas** com busca por nome ou prévia da última mensagem, contador de não lidas, etiqueta de grupo e indicador de IA ativa/pausada.
- **Histórico** sincronizado na primeira conexão, com separadores de data, mensagens citadas, recibos de leitura e selo `IA` nas respostas automáticas.
- **Envio de texto** e **envio de mídia** (imagem, vídeo, áudio ou documento), um arquivo por vez, até **25 MB**.
- **Exibição de mídia recebida** (fotos, vídeos, áudios, figurinhas e documentos) baixada para a pasta local.
- **Respostas automáticas com IA** em qualquer provedor compatível com OpenAI (OpenAI, OpenRouter, Groq, Ollama etc.).
- **Persona configurável**: nome da empresa, nome do assistente, informações/perguntas frequentes e instruções extras.
- **Espera configurável** para juntar mensagens seguidas antes de responder, com indicador de "digitando".
- **Pausa automática** quando você responde manualmente, para assumir o atendimento.
- **Transferência para humano** pelo comando `[[HUMANO]]` gerado pela IA.
- **Grupos opcionais**, desativados por padrão.
- **Limite de respostas por hora** por conversa, com um teto global de segurança.
- **Atividade recente da IA** no painel (respondeu, transferiu, ignorou, erro, teste) e logs do servidor.
- **Atualizações em tempo real** no navegador via SSE (novas mensagens, status, configurações e logs).

---

## Como funciona

```text
Celular com WhatsApp
        │  (WhatsApp Web / protocolo Baileys)
        ▼
Servidor local (Node + Express + Baileys)  ──────►  API de IA compatível com OpenAI
        │                                              (OpenAI, OpenRouter, Groq, Ollama...)
        ├── data/auth        sessão do WhatsApp
        ├── data/messages    histórico local
        ├── data/media       arquivos recebidos/enviados
        ├── data/db.json     conversas e preferências
        └── data/settings.json + data/.secret   configurações e chave criptografada
        ▲
        │  REST + SSE em 127.0.0.1:3333
        ▼
Navegador (React + Vite) em http://127.0.0.1:3333
```

- O navegador conversa apenas com o servidor local.
- O servidor mantém a conexão com o WhatsApp e, quando a IA está ligada, envia o contexto recente para o provedor de IA escolhido.
- Em desenvolvimento, a interface roda no Vite (`http://localhost:5173`) e faz proxy de `/api` para `127.0.0.1:3333`.
- Em produção local, o mesmo servidor Express serve a interface compilada em `dist/` na porta `3333`.

---

## Arquitetura de pastas

```text
whatsapp-ia/
├─ src/                         # Frontend React 19 + Vite + Tailwind + shadcn/ui
│  ├─ components/               # painel, conversa, QR Code, ajustes da IA, mídia
│  ├─ hooks/useWhatsApp.ts      # estado do painel, chamadas REST e eventos SSE
│  ├─ lib/                      # cliente da API, formatação de datas/telefones
│  ├─ App.tsx
│  ├─ main.tsx
│  └─ index.css
├─ server/                      # Backend Node + Express
│  ├─ index.ts                  # rotas da API, SSE, arquivos estáticos e erros
│  ├─ whatsapp.ts               # Baileys: conexão, QR, mensagens, mídia, histórico
│  ├─ ai.ts                     # OpenAI-compatible: prompt, respostas, pausas e limites
│  ├─ store.ts                  # persistência em JSON e estado das conversas
│  ├─ config.ts                 # caminhos, porta, host e variáveis de ambiente
│  ├─ crypto.ts                 # criptografia AES-256-GCM da chave da IA
│  ├─ instance.ts               # instâncias compartilhadas de store/WhatsApp/IA
│  └─ bus.ts                    # EventEmitter usado pelo SSE
├─ shared/
│  └─ types.ts                  # tipos compartilhados entre frontend e backend
├─ data/                        # criado em tempo de execução (NÃO versionar)
│  ├─ auth/                     # credenciais da sessão do WhatsApp
│  ├─ media/                    # arquivos de mídia
│  ├─ messages/                 # histórico por conversa, em JSON
│  ├─ db.json                   # conversas, contatos e preferências
│  ├─ settings.json             # ajustes da IA (chave criptografada)
│  ├─ .secret                   # chave local usada para criptografar a chave da IA
│  ├─ servidor.log              # saída do servidor quando iniciado pelo iniciar.ps1
│  └─ servidor-erro.log         # erros do servidor quando iniciado pelo iniciar.ps1
├─ dist/                        # build do frontend (gerado por npm run build)
├─ .env.example                 # modelo de configuração opcional
├─ iniciar.ps1                  # inicia em modo produção local e abre o navegador
├─ parar.ps1                    # encerra o processo da porta do painel
├─ README.md
├─ COMO-USAR.md
└─ package.json
```

O projeto usa TypeScript no frontend e no backend. O servidor é executado diretamente com `tsx` (sem etapa de compilação do backend); o `npm run build` gera apenas o frontend em `dist/`.

---

## Pré-requisitos

- **Windows 10/11** (os scripts `.ps1` foram feitos para Windows). O projeto também pode ser executado manualmente em Linux/macOS.
- **Node.js 20 ou superior** com npm. Recomendado: Node 22 ou 24 LTS.
- **Git para Windows** — o `npm install` precisa do Git para baixar a dependência `libsignal` do Baileys. Neste computador, o MinGit portátil está em `C:\Users\renat\AppData\Local\git\cmd`. Se o install falhar com `spawn git ENOENT`, instale o [Git para Windows](https://git-scm.com/download/win) e abra um novo terminal.
- **PowerShell 5.1 ou superior** para os scripts de inicialização/parada.
- **Internet** para conectar ao WhatsApp e ao provedor de IA.
- Uma conta do WhatsApp no celular para ler o QR Code.
- Uma chave de API de um provedor compatível com OpenAI (opcional para só usar o painel; obrigatória para respostas automáticas).
- Porta **3333** livre (produção local/API) e, no modo dev, porta **5173** livre.

Neste computador, o Node portátil está em:

```text
C:\Users\renat\AppData\Local\nodejs\node-v24.22.1-win-x64
```

O `iniciar.ps1` procura o Node no `PATH` e também em `%LOCALAPPDATA%\nodejs\node-*\node.exe`, então normalmente não é preciso configurar nada.

### Conferir o Node

Abra o PowerShell e rode:

```powershell
node -v
npm -v
```

Se aparecer `v20.x`, `v22.x` ou `v24.x`, está tudo certo. Se aparecer "não é reconhecido", veja [Node não reconhecido](#node-não-reconhecido).

---

## Instalação

No PowerShell, entre na pasta do projeto:

```powershell
cd "C:\Users\renat\OneDrive\Área de Trabalho\WhatsApp com IA\whatsapp-ia"
```

Instale as dependências:

```powershell
npm install
```

Na primeira vez pode demorar alguns minutos e baixar algumas centenas de MB. É necessário ter internet.

### Configuração opcional com `.env`

O arquivo `.env` é opcional. Para criar uma cópia do modelo:

```powershell
Copy-Item .env.example .env
notepad .env
```

Variáveis disponíveis:

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3333` | Porta do servidor local. Os scripts leem este valor. |
| `OPENAI_API_KEY` | vazio | Chave da IA como alternativa à chave salva pela interface. Fica em texto puro no `.env`. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | URL base inicial do provedor de IA. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Modelo inicial. |
| `SYNC_FULL_HISTORY` | `true` | `true` tenta sincronizar o histórico completo disponível ao conectar; `false` reduz a sincronização. |
| `DATA_DIR` | `./data` | Pasta de dados alternativa (opcional/avançado). |

> A chave salva pela interface tem **prioridade** sobre `OPENAI_API_KEY`. Se você limpar a chave pela interface, o servidor passa a usar a do `.env`, se existir. A chave do `.env` **não é criptografada**; a chave salva pela interface é.

---

## Como executar

### Modo desenvolvimento

```powershell
npm run dev
```

Isso inicia:

- API/servidor em `http://127.0.0.1:3333`;
- interface Vite em **http://localhost:5173**.

Abra **http://localhost:5173** no navegador. Alterações no frontend recarregam automaticamente. Para encerrar, pressione `Ctrl+C` no terminal.

> Em desenvolvimento, não abra `http://127.0.0.1:3333` esperando ver o painel: nessa porta está apenas a API. A interface fica na `5173`.

### Modo produção local

```powershell
npm run build
npm start
```

Abra **http://127.0.0.1:3333**. Nesse modo, o Express serve a interface compilada de `dist/` e a API na mesma porta.

- Rode `npm run build` novamente sempre que alterar o frontend.
- `npm start` sem `dist/` mostra um aviso no console e não serve a interface (só a API).
- Para encerrar, use `Ctrl+C` ou `powershell -ExecutionPolicy Bypass -File .\parar.ps1`.

### Scripts prontos (recomendado no dia a dia)

O `iniciar.ps1`:

1. encontra o Node (PATH ou `%LOCALAPPDATA%\nodejs\node-*`);
2. roda `npm install` se as dependências estiverem faltando;
3. roda `npm run build` se `dist\index.html` não existir;
4. inicia `npm start` em segundo plano;
5. espera o painel responder e abre o navegador;
6. grava os logs em `data\servidor.log` e `data\servidor-erro.log`.

Execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
```

Se o Windows bloquear o script por política de execução, o comando acima contorna a política **somente para essa execução**. Também é possível liberar o arquivo com:

```powershell
Unblock-File .\iniciar.ps1
Unblock-File .\parar.ps1
```

Para encerrar:

```powershell
powershell -ExecutionPolicy Bypass -File .\parar.ps1
```

O `parar.ps1` encerra o processo que estiver ouvindo na porta configurada (3333 por padrão, ou o valor de `PORT` no `.env`). Ele não fecha o navegador nem apaga dados.

> Se você usa `npm run dev`, pare com `Ctrl+C` no terminal. O `parar.ps1` encerra a API na 3333, mas o Vite pode continuar na 5173; nesse caso ele mostra uma dica.

### Build automático no GitHub (GitHub Actions)

O repositório inclui o workflow `.github/workflows/build.yml`. A cada push na branch `main`, o GitHub Actions:

1. instala as dependências com `npm ci`;
2. roda `npm run typecheck`;
3. roda `npm run build`;
4. publica a pasta `dist/` como artefato **whatsai-dist** (por 14 dias).

Para baixar o build: aba **Actions** → workflow **build** → execução mais recente → **Artifacts** → `whatsai-dist`.

> **Importante:** o GitHub Actions só compila a interface. O servidor Express/Baileys e a sessão do WhatsApp continuam rodando na sua máquina (ou em um VPS), porque precisam de um processo contínuo e do QR Code. O `dist/` baixado pode ser copiado para a pasta do projeto; o backend ainda precisa das dependências instaladas localmente com `npm install`.

---

## Como conectar o WhatsApp

1. Inicie o painel (`iniciar.ps1` ou `npm run dev`).
2. Na primeira vez, o QR Code aparece automaticamente no painel. Se não aparecer, clique no ícone de **QR Code** na barra superior ou em **Conectar WhatsApp**.
3. No celular, abra o **WhatsApp**.
4. Toque em **Configurações** (ou nos três pontinhos, dependendo da versão).
5. Toque em **Dispositivos conectados**.
6. Toque em **Conectar dispositivo**.
7. Aponte a câmera do celular para o QR Code exibido no painel.
8. Aguarde o status mudar para **Conectado**. O painel mostra seu nome/número e começa a sincronizar as conversas.

O QR tem validade curta e pode expirar enquanto você o lê. Se expirar ou o celular disser que ele é inválido, clique em **Gerar novo QR** e leia o novo código rapidamente. O painel também pode atualizar o QR automaticamente enquanto a conexão não é concluída.

### O que acontece com a sessão

- A sessão fica em `data/auth/` e o app tenta reconectar automaticamente quando você reinicia o servidor. Normalmente não é preciso ler o QR de novo.
- **Desconectar** no painel (ou no QR Code) encerra a sessão no WhatsApp e apaga `data/auth/`; será necessário ler o QR novamente.
- Se o celular remover o dispositivo conectado, a sessão expira. O painel avisa e você precisa reconectar.
- **O aplicativo não envia sua sessão para nenhum servidor do projeto.** Ela fica local. Atenção: como esta pasta está dentro do OneDrive, o OneDrive pode sincronizar `data/` para a nuvem. Veja [OneDrive](#onedrive).

### Dicas

- Mantenha o celular com internet durante a conexão.
- O computador precisa estar ligado, sem suspender, para o painel responder enquanto você não estiver nele.
- Use um número secundário nos primeiros testes. Veja o [aviso importante](#aviso-importante).

---

## Como configurar a IA

No painel, clique no ícone de **engrenagem** (Ajustes) ou no botão **IA** no rodapé da lista de conversas. A janela **Inteligência artificial** abre com as seções abaixo.

### 1. Ativar respostas automáticas

O interruptor **Respostas automáticas** é o botão geral. Ele vem **desligado** por padrão. Sem ele, a IA não responde nenhuma conversa, mesmo que a chave esteja configurada.

Cada conversa também tem um interruptor **IA** no cabeçalho. Ele permite desligar a IA apenas naquela conversa (`IA desativada nesta conversa`). O ajuste global precisa estar ligado para o interruptor da conversa funcionar.

### 2. Provedor de IA

| Campo | O que faz | Exemplo |
|---|---|---|
| **URL base da API** | Endereço do provedor compatível com OpenAI. Precisa incluir o caminho correto, normalmente `/v1`. | `https://api.openai.com/v1` |
| **Modelo** | Nome exato do modelo no provedor. | `gpt-4o-mini` |
| **Chave da API** | Chave secreta. Deixe em branco para manter a chave já salva. | `sk-...` |
| **Testar conexão** | Salva os ajustes atuais e faz uma chamada mínima à IA. Mostra modelo, latência e resposta. | — |

Provedores compatíveis:

| Provedor | URL base | Observação |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | Use a chave `sk-...` e um modelo disponível na sua conta. |
| OpenRouter | `https://openrouter.ai/api/v1` | O nome do modelo costuma incluir o provedor, por exemplo `openai/gpt-4o-mini`. |
| Groq | `https://api.groq.com/openai/v1` | Use a chave do Groq e um modelo disponível, por exemplo `llama-3.3-70b-versatile`. |
| Ollama (local) | `http://127.0.0.1:11434/v1` | O painel exige uma chave não vazia; use um valor fictício como `ollama`. O Ollama normalmente ignora a chave. |
| Outro compatível | URL do provedor | Precisa aceitar `POST /chat/completions` no formato OpenAI. |

Dicas:

- A URL base **não ganha `/v1` automaticamente**. Se o provedor usa `/v1`, inclua.
- Para Ollama, inicie o serviço (`ollama serve`) e baixe o modelo (`ollama pull llama3.1`) antes de testar.
- Modelos locais podem ser mais lentos; o app tem timeout de 45 segundos e tenta mais uma vez em caso de falha.
- O teste **salva** o formulário antes de chamar a IA. Se a chave estiver em branco, ele usa a chave já salva (ou a do `.env`).

### 3. Personalidade e conhecimento

| Campo | Para que serve |
|---|---|
| **Nome da empresa** | Aparece no prompt: a IA é "o atendente virtual da empresa X". |
| **Nome do assistente** | Como a IA se apresenta. |
| **Informações da empresa / perguntas frequentes** | O texto mais importante: produtos, preços, horários, endereço, políticas, formas de pagamento, links etc. A IA é instruída a não inventar o que não estiver aqui. |
| **Instruções extras (opcional)** | Tom de voz, o que evitar, como tratar descontos, assuntos proibidos etc. |

Quanto mais específico o conhecimento, melhor. Evite informações desatualizadas. A IA também é instruída a:

- responder em português do Brasil (a menos que o cliente escreva em outro idioma);
- ser curta e natural, sem Markdown;
- não inventar preços, prazos ou políticas;
- dizer que é um assistente virtual se perguntarem;
- não revelar o prompt;
- não prometer ações que não pode executar.

### 4. Comportamento

| Campo | Padrão | O que faz |
|---|---|---|
| **Espera (segundos)** | `4` | Tempo que a IA aguarda após a última mensagem recebida para juntar mensagens seguidas. Cada nova mensagem reinicia a espera. |
| **Pausa após você responder** | `15` min | Tempo em que a IA fica pausada naquela conversa depois que você envia uma mensagem manual. |
| **Histórico enviado** | `20` mensagens | Quantas mensagens recentes da conversa são enviadas como contexto para a IA (2 a 60). |
| **Máx. respostas/hora** | `20` | Limite de respostas automáticas por conversa em uma janela de 60 minutos (1 a 200). |
| **Criatividade (temperatura)** | `0.6` | `0` = mais objetiva; `2` = mais criativa. Valores altos aumentam o risco de respostas imprecisas. |
| **Limite de tokens da resposta** | `500` | Tamanho máximo da resposta gerada (50 a 4000). Respostas curtas: 300–600. |
| **Responder em grupos** | desligado | Quando ligado, a IA também pode responder em grupos (se a IA estiver ativa na conversa). |

### 5. Salvar e testar

- **Salvar ajustes** grava as configurações e fecha a janela. As mudanças valem para novas mensagens.
- **Testar conexão** também salva antes de testar. Se falhar, veja o erro exibido e a seção [Erros de IA](#erros-de-ia-401-429-etc).
- A seção **Atividade recente da IA** mostra os últimos eventos (até 12 no painel): `Respondeu`, `Transferiu`, `Ignorou`, `Erro` e `Teste`.

### Onde a chave fica armazenada

- A chave digitada na interface é criptografada com **AES-256-GCM** e gravada em `data/settings.json` no campo `apiKeyEnc`.
- A chave usada para criptografar fica em `data/.secret` (32 bytes aleatórios). Ela é criada automaticamente na primeira gravação.
- O navegador **nunca recebe a chave completa**; a API devolve apenas `apiKeySet` e os quatro últimos caracteres (`apiKeyHint`).
- Se `data/.secret` for apagado, a chave salva não poderá mais ser descriptografada; será preciso digitá-la de novo.
- Se você usar `OPENAI_API_KEY` no `.env`, ela fica em **texto puro** e é usada como fallback quando não há chave salva pela interface.

> Criptografia local protege contra leitura acidental do arquivo, mas não contra alguém que tenha acesso à sua conta do Windows e à pasta `data/` (com a chave `.secret`). Proteja o computador e a pasta.

---

## Como a resposta automática funciona

O fluxo real, do jeito que está implementado:

1. **Só mensagens recebidas disparam a IA.** Mensagens enviadas por você (pelo painel, pelo celular ou por outro dispositivo conectado) não geram resposta automática; elas pausam a IA.
2. **Filtros antes de responder:**
   - a IA precisa estar ligada **globalmente** e **na conversa**;
   - a conversa não pode estar pausada;
   - o WhatsApp precisa estar conectado;
   - se for grupo, **Responder em grupos** precisa estar ligado;
   - a última mensagem precisa ser recebida e ter menos de **15 minutos**;
   - mensagens que chegam com atraso (mais de **5 minutos**, como backlog de sincronização ou servidor que ficou desligado) são tratadas como históricas e **não** disparam a IA;
   - é preciso haver chave de API configurada;
   - o limite por hora não pode ter sido atingido.
3. **Espera para juntar mensagens.** O servidor aguarda o valor de **Espera (segundos)** (padrão 4 s). Se o cliente mandar outra mensagem nesse intervalo, o timer reinicia. Isso evita várias respostas para uma rajada de mensagens.
4. **Indicador "digitando".** Antes de gerar, o app envia presença `composing` para o WhatsApp. Se o cliente estiver com a conversa aberta, vê "digitando...".
5. **Montagem do contexto.** São enviadas as últimas `Histórico enviado` mensagens, com as suas mensagens como `assistant` e as do cliente como `user`. Mídias entram como texto/placeholder:
   - foto → `[o cliente enviou uma foto]`;
   - vídeo → `[o cliente enviou um vídeo]`;
   - áudio → `[o cliente enviou um áudio]`;
   - documento → `[o cliente enviou o documento NOME]`;
   - figurinha → `[figurinha]`.
   A IA **não vê a imagem, não ouve o áudio, não lê PDFs e não transcreve voice notes**. Ela só usa o texto, a legenda e esses avisos.
6. **Chamada à IA.** O app usa `POST /chat/completions` no formato OpenAI, com o prompt de sistema (persona + conhecimento + regras), temperatura e limite de tokens configurados. Timeout de 45 s e uma tentativa extra.
7. **Proteção contra resposta atrasada.** Se uma nova mensagem chegar enquanto a IA está gerando, a resposta antiga é descartada e o processo é reagendado. Se você pausar a conversa nesse intervalo, a resposta não é enviada.
8. **Envio humanizado.** Depois de gerar, o app espera mais um pequeno intervalo proporcional ao tamanho da resposta (entre ~0,7 s e 4,5 s), desliga o "digitando" e envia o texto. A mensagem fica marcada com o selo **IA**.
9. **Pausa por atendimento humano.** Qualquer mensagem **manual** enviada por você naquela conversa (pelo painel ou pelo celular) pausa a IA por **Pausa após você responder** (padrão 15 min). Cada nova mensagem manual reinicia a contagem. No cabeçalho aparece `IA pausada — você assumiu o atendimento` e o botão **Reativar**.
10. **Transferência com `[[HUMANO]]`.** A IA é instruída a terminar a resposta com `[[HUMANO]]` quando o cliente pedir uma pessoa, reclamar, pedir cancelamento/reembolso ou quando o assunto exigir uma decisão humana. O marcador é removido antes do envio e a conversa é pausada por **no mínimo 60 minutos** (ou pelo valor de pausa, se for maior). O evento aparece como **Transferiu** na atividade.
11. **Limites.** O app conta respostas por conversa em uma janela de 60 minutos. Além do limite por conversa, existe um teto global de segurança de `max(50, 5 × limite por conversa)` respostas por hora. Ao atingir, a IA para e registra **Ignorou** com o motivo. Os contadores ficam em memória e zeram quando o servidor reinicia.
12. **Contexto limitado.** A IA não tem memória de longo prazo: ela só vê as últimas `Histórico enviado` mensagens da conversa. Se a informação não estiver no conhecimento configurado nem nesse histórico, ela deve perguntar ou transferir.

### Pausar e reativar

- **Global:** desligue **Respostas automáticas** em Ajustes. Nenhuma conversa recebe resposta automática.
- **Por conversa:** desligue o interruptor **IA** no cabeçalho. Isso grava uma exceção só para aquela conversa.
- **Pausa temporária:** ao responder manualmente, a IA pausa sozinha. Clique em **Reativar agora** no aviso amarelo (ou **Reativar** no cabeçalho) para voltar antes do tempo.
- **Transferência:** depois de um `[[HUMANO]]`, a conversa fica pausada por pelo menos 1 hora; reative manualmente quando terminar o atendimento.

> A IA só envia texto. Ela não executa pagamentos, não emite notas, não agenda nada e não acessa sistemas externos. Trate as respostas como sugestões e acompanhe o atendimento.

---

## Segurança e privacidade

- **Só localhost:** o servidor escuta em `127.0.0.1` (fixo no código). Outros computadores da rede não conseguem acessar por padrão.
- **Sem login:** qualquer pessoa que usar o seu usuário do Windows e abrir o navegador pode entrar no painel, ler conversas e enviar mensagens. Não exponha a porta 3333 na internet, não faça port forwarding e não coloque um proxy reverso público sem autenticação.
- **Dados sensíveis em `data/`:**
  - `data/auth/` dá controle da sua conta do WhatsApp. Trate como senha.
  - `data/messages/` e `data/media/` contêm conversas e arquivos de clientes.
  - `data/settings.json` contém a chave da IA criptografada; `data/.secret` contém a chave de descriptografia.
- **Não versione:** `data/`, `.env`, `dist/`, `node_modules/` e logs já estão no `.gitignore`. Antes de publicar um repositório, confira que nenhum dado real foi incluído.
- **OneDrive:** como o projeto está dentro do OneDrive, `data/` pode ser sincronizado para a nuvem da Microsoft. Se isso não for aceitável, pause a sincronização da pasta ou mova o projeto para fora do OneDrive (veja [OneDrive](#onedrive)).
- **Provedor de IA:** quando a IA responde, o texto das últimas mensagens, o seu conhecimento e o prompt são enviados ao provedor configurado. Se isso for sensível, use um modelo local (Ollama) ou não ative a IA. O WhatsApp também recebe as mensagens normalmente; o Baileys apenas faz a ponte no seu computador.
- **Mídia:** arquivos recebidos são baixados para `data/media/` (até 25 MB cada). Eles não são enviados ao provedor de IA; a IA recebe apenas o aviso de que existe uma mídia.
- **Backup:** pare o servidor antes de copiar. Faça backup de `data/` inteiro (incluindo `.secret`) e do `.env`, se usar. Guarde o backup em local seguro: ele contém a sessão do WhatsApp e conversas.
- **Exclusão:** para desconectar sem apagar conversas, use **Desconectar** no painel ou apague apenas `data/auth/` com o servidor parado. Para apagar tudo, pare o servidor e remova `data/` — isso é irreversível. Se apagar `data/auth/` sem usar o botão Desconectar, remova também o dispositivo antigo em **WhatsApp > Dispositivos conectados**.
- **LGPD/privacidade:** se você atende clientes, você é responsável pela base legal, pelos avisos e pelo tempo de retenção desses dados. Não use o painel para coletar dados sem consentimento.

---

## Aviso importante

**Este projeto usa Baileys, uma biblioteca não oficial que implementa o protocolo do WhatsApp Web.** Ela não é afiliada, autorizada ou suportada pelo WhatsApp/Meta.

- O uso de automação não oficial **pode violar os Termos de Serviço do WhatsApp**.
- Existe **risco real de restrição temporária ou banimento permanente do número**, mesmo em uso pequeno. Não há garantia de reversão.
- **Não use seu número principal, pessoal ou o número central da empresa nos primeiros testes.** Use um número secundário e mantenha um backup dos contatos importantes.
- **Não use para spam**, disparo em massa, listas frias, scraping, assédio ou qualquer abordagem sem consentimento. Isso aumenta muito o risco de banimento e pode violar leis.
- O projeto pode parar de funcionar quando o WhatsApp mudar o protocolo. Atualizações do Baileys podem ser necessárias.
- A IA pode errar, inventar ou responder de forma inadequada. Revise o conhecimento, acompanhe as conversas e mantenha um humano responsável.

**Para produção, empresas ou atendimento em escala**, use a **WhatsApp Cloud API oficial da Meta** com um número dedicado. Ela exige configuração de empresa, opt-in dos clientes, templates para mensagens iniciadas pela empresa, janela de atendimento e cobrança conforme as regras vigentes. É o caminho suportado, estável e adequado para operação comercial. Este projeto é destinado a estudo e uso pessoal/pequeno, por sua conta e risco.

Este projeto não é afiliado ao WhatsApp, Meta, OpenAI, OpenRouter, Groq ou Ollama.

---

## Solução de problemas

### QR não aparece

- Na primeira conexão, o QR pode levar alguns segundos. O painel mostra **Gerando QR Code...**.
- Se ficar nisso, clique em **Gerar novo QR**.
- Confira `data\servidor.log` e `data\servidor-erro.log` (se iniciou pelo `iniciar.ps1`) ou o terminal (se iniciou com `npm start`/`npm run dev`).
- Verifique se o computador tem internet e se algo (firewall, proxy, antivírus) bloqueia `web.whatsapp.com`.
- Feche o painel, pare o servidor e tente novamente. Se o problema persistir, com o servidor **parado**, apague `data\auth\` e inicie de novo:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\parar.ps1
  Remove-Item -Recurse -Force .\data\auth
  powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
  ```
  Isso apaga só a sessão; conversas e ajustes continuam.
- Se o QR aparece mas o celular diz que é inválido, gere outro e leia rápido (ele expira).

### Sessão expirada ou desconectada

- Se o celular removeu o dispositivo ou você saiu no WhatsApp, a sessão expira. O app mostra `Sessão encerrada. Conecte novamente lendo o QR Code.` e apaga `data/auth/` automaticamente.
- Clique em **Conectar WhatsApp** e leia o novo QR.
- Se o erro continuar, pare o servidor, apague `data/auth/` e reconecte. Depois remova o dispositivo antigo em **WhatsApp > Dispositivos conectados**.
- Evite manter duas cópias do projeto abertas usando a mesma pasta `data/` (por exemplo, OneDrive em dois computadores): isso pode corromper a sessão.

### Node não reconhecido

Se `node -v` falhar:

1. Feche e abra um novo PowerShell (o PATH só é recarregado em terminais novos).
2. Confira se o Node portátil existe:
   ```powershell
   Get-ChildItem "$env:LOCALAPPDATA\nodejs" -Directory
   ```
3. Adicione temporariamente ao PATH (ajuste a versão se necessário):
   ```powershell
   $env:Path = "$env:LOCALAPPDATA\nodejs\node-v24.22.1-win-x64;$env:Path"
   node -v
   ```
4. Se funcionar, use o `iniciar.ps1`, que localiza essa pasta sozinho. Para tornar permanente, adicione a pasta em **Configurações do Windows > Sistema > Variáveis de ambiente > Path**.
5. Instale o Node 20+ em [nodejs.org](https://nodejs.org/) se não houver nenhuma instalação.

### Porta 3333 ocupada

Sintoma: `EADDRINUSE`, ou o painel não sobe e o script diz que a porta está em uso.

```powershell
Get-NetTCPConnection -LocalPort 3333 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

- Se for uma instância antiga do painel, rode:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\parar.ps1
  ```
- Se for outro programa, feche-o ou altere `PORT` no `.env` e reinicie. O `iniciar.ps1` e o `parar.ps1` leem essa variável.
- No modo **dev**, o proxy do Vite aponta para `3333`; se você mudar a porta, ajuste também `vite.config.ts` (`server.proxy['/api'].target`). Para evitar confusão, mantenha 3333 no dev.
- Não rode `npm run dev` e `npm start` ao mesmo tempo: os dois tentam usar a 3333.

### Erros de IA (401, 429 etc.)

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `401` / `invalid_api_key` | Chave errada, revogada ou de outro provedor. | Confira a chave, cole de novo em **Chave da API**, salve e teste. Verifique se a URL base combina com a chave. |
| `403` | Sem permissão, modelo bloqueado ou conta sem crédito. | Veja o painel do provedor (cobrança/limites) e escolha um modelo liberado. |
| `404` | URL base ou nome do modelo errado. | Inclua o caminho `/v1` correto e use o nome exato do modelo no provedor. |
| `429` | Limite de requisições ou cota do provedor. | Aguarde, confira o plano/cobrança e reduza o uso. Se for o limite do próprio app, a atividade mostra `Limite de ... respostas por hora atingido`. |
| `400` | Modelo não aceita algum parâmetro (por exemplo, `max_tokens`). | Reduza o limite de tokens, teste outro modelo ou ajuste a URL/modelo compatível. |
| Timeout / `ECONNREFUSED` | Ollama/LM Studio não está rodando, URL local errada ou rede bloqueada. | Inicie o serviço local, confira a porta (Ollama: 11434) e a URL base. |
| `Nenhuma chave de API configurada` | Falta a chave. | Salve uma chave válida em Ajustes ou defina `OPENAI_API_KEY` no `.env` e reinicie. |

Observações:

- **Testar conexão** salva o formulário antes de testar. Se a chave estiver em branco, usa a chave já salva.
- A chave da interface tem prioridade sobre `OPENAI_API_KEY` do `.env`.
- Se você limpou a chave pela interface e o `.env` tem uma chave, o app usa a do `.env`.
- O erro detalhado do provedor aparece na atividade da IA e no log do servidor. Evite compartilhar esses logs sem apagar chaves e telefones.

### Áudio não baixa ou não toca

- A IA **não transcreve áudio**. Ela recebe apenas `[o cliente enviou um áudio]`.
- O download da mídia é assíncrono, com timeout de **25 segundos** e limite de **25 MB**. Arquivos maiores são ignorados (com registro na atividade).
- Mídias do **histórico inicial** não são baixadas; só mensagens novas têm download automático.
- Se o servidor estava desligado quando a mensagem chegou, o WhatsApp pode não permitir mais o download (mídia expirada). Peça para o cliente reenviar.
- Se o arquivo existe em `data/media/` mas não toca, verifique o formato/codec no navegador e tente outro navegador.
- Áudios enviados pelo painel são enviados como arquivo de áudio, não como mensagem de voz (`ptt`).

### Histórico não aparece

- A sincronização inicial pode levar alguns minutos. A barra inferior mostra **Sincronizando N** enquanto processa.
- Confirme `SYNC_FULL_HISTORY=true` no `.env` e reinicie o servidor. Com `false`, a sincronização é reduzida.
- O WhatsApp não entrega necessariamente todo o histórico para um dispositivo recém-conectado; o app guarda o que for enviado.
- **Limites locais:** o app armazena no máximo **3.000 mensagens por conversa** e a interface carrega as **últimas 300**.
- Mensagens históricas **não** contam como não lidas e **não** disparam a IA.
- Se você precisa forçar uma nova sincronização completa, pode desconectar e reconectar (isso apaga a sessão e pode não recuperar tudo). Faça backup de `data/` antes.
- Verifique se há arquivos em `data/messages/`. Se um JSON estiver corrompido, o app pode tratá-lo como vazio; restaure um backup.

### IA não responde

Confira, nesta ordem:

1. **Respostas automáticas** está ligado em Ajustes?
2. O interruptor **IA** da conversa está ligado?
3. A conversa está pausada (aviso `IA pausada — você assumiu o atendimento`)? Clique em **Reativar**.
4. É um grupo? **Responder em grupos** está desligado?
5. A última mensagem tem menos de 15 minutos?
6. A chave está configurada e o **Testar conexão** funciona?
7. O limite de respostas por hora foi atingido?
8. O WhatsApp está **Conectado** (sem o aviso amarelo de desconexão)?
9. O computador estava ligado e sem suspender?
10. Veja **Atividade recente da IA**: os eventos `Ignorou`, `Erro`, `Transferiu` explicam o motivo.

Lembre-se: se **você** enviou a última mensagem, a IA pausa e não responde. A IA só responde mensagens recebidas.

> Mensagens que chegam com mais de **5 minutos** de atraso (por exemplo, o backlog de quando o servidor estava desligado) são tratadas como histórico e não disparam a IA. Peça ao cliente para enviar uma nova mensagem.

### Painel em branco ou `npm start` sem interface

- No modo dev, abra `http://localhost:5173`, não a 3333.
- No modo produção, rode `npm run build` antes de `npm start`. Se `dist/` não existir, o servidor avisa e serve só a API.
- Force a atualização do navegador com `Ctrl+F5`.
- Veja o terminal ou `data\servidor-erro.log`.
- Se o build falhar, rode `npm install` novamente e confira a versão do Node.

### Script bloqueado pelo PowerShell

Erro comum: *"a execução de scripts foi desabilitada neste sistema"*.

Use:

```powershell
powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
powershell -ExecutionPolicy Bypass -File .\parar.ps1
```

Isso vale só para a execução atual. Se o arquivo foi baixado da internet, rode `Unblock-File .\iniciar.ps1` e `Unblock-File .\parar.ps1`. Não é necessário desabilitar a política permanentemente.

### OneDrive

O projeto está em uma pasta do OneDrive. Isso pode causar:

- sincronização de `data/auth`, conversas, mídia e da chave `.secret` para a nuvem;
- arquivos bloqueados no momento da gravação (`db.json.tmp`, `settings.json.tmp`);
- conflitos se o OneDrive estiver aberto em outro computador;
- lentidão no `node_modules` e no build.

Recomendações:

- **Pause a sincronização** do OneDrive enquanto o painel estiver rodando, ou mova o projeto para uma pasta local, como `C:\WhatsApp-IA`.
- Antes de mover, **pare o servidor** e copie a pasta inteira, incluindo `data/` e `.env`.
- Não abra a mesma pasta `data/` em dois computadores ao mesmo tempo.
- Caminhos com espaços e acentos funcionam nos scripts (eles usam `LiteralPath`), mas caminhos simples reduzem problemas.

### Outros sintomas

- **`npm install` falha:** confira internet, espaço em disco e se o Node é 20+. Feche antivírus/OneDrive que possa bloquear arquivos e tente de novo.
- **`tsx` não encontrado:** rode `npm install` (o `tsx` é dependência do projeto).
- **Celular sem internet:** o painel pode continuar "Conectado" por um tempo, mas o envio/recebimento falha. Reconecte.
- **Mensagem enviada não aparece:** aguarde alguns segundos; o status pode ficar `pending` e depois `sent`/`delivered`/`read`. Se ficar `error`, veja o log e reconecte.
- **Muitas mensagens/volume alto:** o armazenamento em JSON é adequado para uso pequeno. Para escala, use um banco de dados e a API oficial.

---

## Estrutura de dados

Tudo fica em `data/` (ignorado pelo Git). Os arquivos são gravados de forma agrupada e atômica; ainda assim, pare o servidor antes de copiar/editar.

| Caminho | Conteúdo | Sensibilidade |
|---|---|---|
| `data/auth/` | Credenciais da sessão do WhatsApp (arquivos do Baileys). | **Altíssima** — equivale à sessão conectada. |
| `data/db.json` | Conversas (`chats`), preferências por conversa (`chatSettings`: IA ligada/desligada, pausa até quando e motivo) e contatos (`contacts`). | Alta — metadados de conversas. |
| `data/messages/<jid>.json` | Mensagens de cada conversa, até 3.000 por chat. | Alta — conteúdo das conversas. |
| `data/media/` | Imagens, vídeos, áudios, figurinhas e documentos baixados/enviados (até 25 MB cada). | Alta — conteúdo pessoal. |
| `data/settings.json` | Ajustes da IA; a chave fica em `apiKeyEnc` (AES-256-GCM) e os últimos 4 caracteres em `apiKeyHint`. | Alta. |
| `data/.secret` | Chave local de 32 bytes (hex) para criptografar/descriptografar a chave da IA. | **Altíssima** — sem ela, a chave salva é inutilizável. |
| `data/servidor.log` e `data/servidor-erro.log` | Saída do servidor quando iniciado pelo `iniciar.ps1`. | Média — podem conter números e erros. |
| `dist/` | Build do frontend gerado por `npm run build`. | Baixa. |
| `.env` | Configurações opcionais; pode conter a chave da IA em texto puro. | Alta. |

Observações:

- **Não há banco de dados externo.** É JSON local, pensado para um único processo.
- **Limite de mensagens:** ao passar de 3.000 por conversa, as mais antigas são removidas.
- **Interface:** carrega as últimas 300 mensagens por conversa.
- **Atividade da IA:** fica em memória (até 120 eventos) e **não é persistida**; reiniciar o servidor zera. O painel mostra os 12 mais recentes.
- **Pausas:** `pausedUntil` é um timestamp; ao expirar, a IA volta a poder responder novas mensagens (a menos que o interruptor da conversa esteja desligado).
- **Backup:** copie `data/` inteiro, incluindo `.secret`. Se copiar só `settings.json`, a chave criptografada não será legível em outro local sem o `.secret`.
- **Reset total:** pare o servidor, renomeie `data/` para `data-backup/` e inicie de novo. Você terá que ler o QR e configurar a IA outra vez.

---

## Endpoints principais

A API é interna do painel, roda em `127.0.0.1` e **não tem autenticação**. Não a exponha na rede/internet. As rotas podem mudar sem aviso; não são uma API pública estável.

| Método e rota | Função |
|---|---|
| `GET /api/health` | Verificação simples (`{ ok: true }`). |
| `GET /api/status` | Estado da conexão, QR (data URL), número conectado, erro e progresso da sincronização. |
| `POST /api/connect` | Inicia/tenta conectar o WhatsApp. |
| `POST /api/restart` | Reinicia o socket e gera um novo QR quando necessário. |
| `POST /api/logout` | Desconecta a conta, encerra a sessão e apaga `data/auth/`. |
| `GET /api/chats?q=...` | Lista conversas; `q` busca por nome ou última mensagem. |
| `GET /api/chats/:chatId/messages?limit=300` | Mensagens da conversa (limite de 1 a 500; padrão 300). |
| `POST /api/chats/:chatId/send` | Envia texto (`{ "text": "..." }`, até 6.000 caracteres). |
| `POST /api/chats/:chatId/send-media` | Envia um arquivo via `multipart/form-data` (`file`, opcional `caption`), até 25 MB. |
| `PATCH /api/chats/:chatId` | Altera a IA da conversa (`aiEnabled: true/false/null`) e/ou retoma (`resume: true`). |
| `POST /api/chats/:chatId/read` | Marca a conversa como lida e envia recibo de leitura ao WhatsApp. |
| `GET /api/settings` | Configurações públicas da IA (sem a chave completa). |
| `PUT /api/settings` | Salva configurações; aceita `apiKey` e `clearApiKey`. |
| `POST /api/ai/test` | Testa a conexão com o provedor de IA. |
| `GET /api/ai/logs` | Últimos eventos da IA (memória, até 120). |
| `GET /api/media/:file` | Serve um arquivo de `data/media/`. |
| `GET /api/events` | Stream SSE com eventos `status`, `settings`, `chat`, `message`, `message-update`, `ai-log` e `sync-complete`. |

O identificador `:chatId` é o JID do WhatsApp (por exemplo, `5511999999999@s.whatsapp.net` ou `...@g.us`). O backend valida o formato antes de usar.

---

## Limitações conhecidas

- **Não é oficial.** O maior risco é o banimento/restrição do número. Veja o [aviso importante](#aviso-importante).
- **Uma conta e um usuário.** Não há multiusuário, permissões, filas, tags, CRM, campanhas ou agendamento.
- **Um computador.** Se ele desligar, suspender ou perder a internet, o painel e a IA param. Não há hospedagem em nuvem.
- **Sem transcrição de áudio, OCR ou leitura de PDF.** A IA recebe apenas texto, legendas e avisos de mídia.
- **Histórico limitado.** Depende do que o WhatsApp envia, fica em 3.000 mensagens por conversa e a interface mostra 300.
- **Mídias antigas.** Áudios, imagens, vídeos e documentos recebidos antes desta versão não guardam as chaves de descriptografia do WhatsApp. Eles aparecem como “não baixados” e só podem ser recuperados com uma nova sincronização/pareamento. Mídias novas são baixadas automaticamente, até 25 MB.
- **Logs da IA em memória.** São perdidos ao reiniciar; não há exportação nem relatórios.
- **Limites em memória.** Os contadores de resposta por hora zeram ao reiniciar o servidor.
- **Um arquivo por envio**, até 25 MB. Não há encaminhamento, resposta em thread ou edição de mensagens.
- **Sem chamadas, status, canais/newsletters ou pagamentos.** Mensagens de status, broadcast e newsletter são ignoradas.
- **A IA pode errar.** Ela não executa ações externas; só envia texto. Revise o conhecimento e acompanhe.
- **Sessão pode expirar** a qualquer momento por decisão do WhatsApp.
- **JSON local** não é indicado para volume alto, concorrência ou múltiplos processos.
- **Sem suporte oficial.** É um projeto pessoal em beta; use por sua conta e risco.

---

## Resumo para começar

```powershell
cd "C:\Users\renat\OneDrive\Área de Trabalho\WhatsApp com IA\whatsapp-ia"
npm install
powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
```

Depois:

1. leia o QR Code no painel;
2. abra **Ajustes da IA**, configure a chave, o modelo e o conhecimento;
3. ligue **Respostas automáticas**;
4. teste com outro número;
5. para parar, rode `powershell -ExecutionPolicy Bypass -File .\parar.ps1`.

Guia curto: [COMO-USAR.md](COMO-USAR.md).

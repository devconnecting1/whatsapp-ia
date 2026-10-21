# Como usar o WhatsApp com IA — guia rápido

Guia de 1 página para colocar o painel no ar, conectar o WhatsApp e ligar a IA. Para detalhes, veja o [README.md](README.md).

> **Aviso:** a conexão usa Baileys, que **não é oficial**. Há risco de restrição ou banimento do número. Teste com um número secundário, nunca com o principal. Para produção, use a WhatsApp Cloud API oficial da Meta.

## Checklist antes de começar

- [ ] Node.js **20 ou superior** instalado (`node -v`).
- [ ] A pasta do projeto aberta no PowerShell.
- [ ] Internet funcionando.
- [ ] Um celular com WhatsApp para ler o QR Code.
- [ ] Um número **secundário** para os primeiros testes.
- [ ] Uma chave de API compatível com OpenAI (OpenAI, OpenRouter, Groq ou Ollama local) — só é obrigatória para a IA responder.

## 1. Instalar e abrir o painel

No PowerShell:

```powershell
cd "C:\Users\renat\OneDrive\Área de Trabalho\WhatsApp com IA\whatsapp-ia"
npm install
powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
```

O script encontra o Node, instala o que falta, gera o build se necessário, inicia o servidor e abre o navegador em **http://127.0.0.1:3333**.

Se preferir o modo desenvolvimento:

```powershell
npm run dev
```

e abra **http://localhost:5173** (a porta 3333 fica só com a API).

## 2. Conectar o WhatsApp

- [ ] No painel, clique em **Conectar WhatsApp** (ou no ícone de QR Code).
- [ ] No celular: **WhatsApp > Configurações > Dispositivos conectados > Conectar dispositivo**.
- [ ] Aponte a câmera para o QR Code da tela.
- [ ] Espere o status mudar para **Conectado** e aparecer o seu número.

Se o QR expirar, clique em **Gerar novo QR**. Depois da primeira conexão, a sessão fica em `data/auth/` e o painel tenta reconectar sozinho ao reiniciar.

## 3. Configurar a IA

- [ ] Clique na **engrenagem** (Ajustes) ou no botão **IA** no rodapé da lista de conversas.
- [ ] Em **Provedor de IA**, preencha:
  - **URL base da API** — ex.: `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, `https://api.groq.com/openai/v1` ou `http://127.0.0.1:11434/v1` (Ollama).
  - **Modelo** — ex.: `gpt-4o-mini` (OpenAI), `openai/gpt-4o-mini` (OpenRouter), `llama-3.3-70b-versatile` (Groq) ou um modelo baixado no Ollama.
  - **Chave da API** — cole a chave. Para Ollama, use um valor fictício como `ollama`.
- [ ] Em **Personalidade e conhecimento**, preencha **Nome da empresa**, **Nome do assistente**, **Informações da empresa / perguntas frequentes** e, se quiser, **Instruções extras**.
- [ ] Em **Comportamento**, ajuste a **Espera (segundos)** (padrão 4), a **Pausa após você responder** (padrão 15 min), o **Histórico enviado** (padrão 20) e o **Máx. respostas/hora** (padrão 20).
- [ ] Clique em **Testar conexão**. Ele **salva** os ajustes e faz uma chamada real à IA. Se aparecer modelo/latência, está funcionando.
- [ ] Ligue o interruptor **Respostas automáticas**.
- [ ] Clique em **Salvar ajustes**.

> Para Ollama: rode `ollama serve` e baixe o modelo com `ollama pull llama3.1` antes de testar. A URL precisa terminar em `/v1`.

## 4. Testar com outro número

- [ ] De **outro celular**, envie uma mensagem para o número conectado. Ex.: *"Oi! Qual o horário de funcionamento?"*
- [ ] O painel deve receber a mensagem.
- [ ] Depois de ~4 segundos, deve aparecer **"digitando..."** no WhatsApp e a resposta com o selo **IA** no painel.
- [ ] Confira em **Ajustes > Atividade recente da IA** o evento **Respondeu**.
- [ ] Teste uma transferência: envie *"Quero falar com uma pessoa"*. A IA deve responder e a conversa ficar pausada (evento **Transferiu**).

Se a IA não responder, confira: **Respostas automáticas** ligado, interruptor **IA** da conversa ligado, conversa não pausada, chave válida, limite por hora e se a mensagem tem menos de 15 minutos.

## 5. Pausar e reativar a IA

- **Pausa automática:** quando **você** responde manualmente (pelo painel ou pelo celular), a IA pausa sozinha naquela conversa por 15 minutos (ou o valor configurado).
- **Reativar:** clique em **Reativar agora** no aviso amarelo ou no botão **Reativar** no cabeçalho.
- **Só nesta conversa:** desligue o interruptor **IA** no cabeçalho. Para voltar, ligue de novo.
- **Em todas as conversas:** desligue **Respostas automáticas** em Ajustes.
- **Após transferência `[[HUMANO]]`:** a conversa fica pausada por pelo menos 1 hora. Reative quando terminar o atendimento.

## 6. Parar o painel

```powershell
powershell -ExecutionPolicy Bypass -File .\parar.ps1
```

No modo `npm run dev`, use `Ctrl+C` no terminal.

## Se algo não funcionar

| Problema | O que fazer |
|---|---|
| QR não aparece | Aguarde alguns segundos; clique em **Gerar novo QR**; veja `data\servidor.log` e `data\servidor-erro.log`. |
| Sessão expirada | Clique em **Conectar WhatsApp** e leia o novo QR. Se persistir, pare o servidor, apague `data\auth\` e reconecte. |
| Node não reconhecido | Use o `iniciar.ps1` (ele procura em `%LOCALAPPDATA%\nodejs`) ou adicione o Node ao PATH. |
| Porta 3333 ocupada | Rode `powershell -ExecutionPolicy Bypass -File .\parar.ps1` ou altere `PORT` no `.env`. Não rode dev e produção juntos. |
| IA com erro 401 | Chave/URL base incorretas. Cole a chave de novo e teste. A chave da interface tem prioridade sobre o `.env`. |
| IA com erro 429 | Cota/limite do provedor ou limite por hora do app. Aguarde ou ajuste o limite. |
| IA não responde | Veja global, interruptor da conversa, pausa, grupo, chave, limite e **Atividade recente da IA**. |
| Histórico não aparece | Aguarde **Sincronizando**; confira `SYNC_FULL_HISTORY=true` no `.env` e reinicie. |
| Áudio não toca | A IA não transcreve áudio; mídias do histórico não são baixadas; arquivos acima de 25 MB são ignorados. |
| Painel em branco | No dev, abra a porta **5173**. Em produção, rode `npm run build` antes de `npm start`. |
| Script bloqueado | Use `powershell -ExecutionPolicy Bypass -File .\iniciar.ps1` (e o mesmo para `parar.ps1`). |
| OneDrive lento/conflitos | Pause a sincronização ou mova o projeto para `C:\WhatsApp-IA`, sempre com o servidor parado. |

**Segurança:** o painel não tem login e escuta só em `127.0.0.1`. Não exponha a porta 3333 na internet. A pasta `data/` contém a sessão do WhatsApp e conversas — faça backup com o servidor parado e não a compartilhe. A chave salva pelo painel é criptografada localmente; a chave do `.env`, se usada, fica em texto puro. O texto das conversas vai para o provedor de IA quando a resposta automática está ligada.

Leia o [README.md](README.md) para configuração avançada, endpoints e solução de problemas completa.

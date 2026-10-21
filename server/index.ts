import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { HOST, IS_PROD, PORT, ROOT } from './config';
import { bus } from './bus';
import { ai, manager, store } from './instance';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Proteção contra DNS rebinding e CSRF: só aceita o próprio painel local.
const LOCAL_HOSTS = new Set([
  `127.0.0.1:${PORT}`,
  `localhost:${PORT}`,
  '127.0.0.1:5173',
  'localhost:5173',
]);
app.use((req, res, next) => {
  const host = req.headers.host;
  if (host && !LOCAL_HOSTS.has(host)) {
    res.status(403).json({ error: 'Host não permitido. Use 127.0.0.1 ou localhost.' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const url = new URL(origin);
        if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
          res.status(403).json({ error: 'Origem não permitida.' });
          return;
        }
      } catch {
        res.status(403).json({ error: 'Origem inválida.' });
        return;
      }
    }
  }
  next();
});

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, issue?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

/** Garante que o id é um JID do WhatsApp, evitando caminhos estranhos. */
function chatIdFrom(req: Request): string {
  const chatId = req.params.chatId;
  if (!chatId || !/^[\w.-]+@(s\.whatsapp\.net|g\.us|lid|broadcast)$/.test(chatId)) {
    throw new HttpError(400, 'Conversa inválida.');
  }
  return chatId;
}

// ---------------- status & conexão ----------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/status', (_req, res) => {
  res.json(manager.getStatus());
});

app.post('/api/connect', async (_req, res, next) => {
  try {
    await manager.start();
    res.json({ ok: true, status: manager.getStatus() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/restart', async (_req, res, next) => {
  try {
    await manager.restart();
    res.json({ ok: true, status: manager.getStatus() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/logout', async (_req, res, next) => {
  try {
    ai.cancelAll();
    await manager.logout();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ---------------- conversas ----------------
app.get('/api/chats', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(store.listChats(query));
});

app.get('/api/chats/:chatId/messages', (req, res) => {
  const chatId = chatIdFrom(req);
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, rawLimit)) : 300;
  const messages = store.getMessages(chatId).slice(-limit);
  res.json(messages);
});

const sendSchema = z.object({
  text: z.string().min(1, 'Escreva uma mensagem.').max(6000, 'Mensagem muito longa.'),
});

app.post('/api/chats/:chatId/send', async (req, res, next) => {
  try {
    const chatId = chatIdFrom(req);
    const { text } = parse(sendSchema, req.body);
    const message = await manager.sendText(chatId, text);
    res.json({ message });
  } catch (error) {
    next(error);
  }
});

app.post('/api/chats/:chatId/send-media', upload.single('file'), async (req, res, next) => {
  try {
    const chatId = chatIdFrom(req);
    if (!req.file) throw new HttpError(400, 'Selecione um arquivo.');
    const caption = typeof req.body?.caption === 'string' ? req.body.caption.slice(0, 2000) : '';
    const message = await manager.sendMedia(
      chatId,
      req.file.buffer,
      req.file.mimetype || 'application/octet-stream',
      req.file.originalname || 'arquivo',
      caption,
    );
    res.json({ message });
  } catch (error) {
    next(error);
  }
});

const chatUpdateSchema = z
  .object({
    aiEnabled: z.boolean().nullable().optional(),
    resume: z.boolean().optional(),
  })
  .strict();

app.patch('/api/chats/:chatId', (req, res, next) => {
  try {
    const chatId = chatIdFrom(req);
    const body = parse(chatUpdateSchema, req.body);
    const existing = store.getChat(chatId);
    if (!existing) throw new HttpError(404, 'Conversa não encontrada.');

    if (body.resume) store.resumeChat(chatId);
    const chat =
      body.aiEnabled !== undefined
        ? store.setChatAi(chatId, body.aiEnabled)
        : store.getChat(chatId);

    if (!chat) throw new HttpError(404, 'Conversa não encontrada.');
    if (chat.aiEnabled && !store.isChatPaused(chatId)) ai.schedule(chatId);
    res.json(chat);
  } catch (error) {
    next(error);
  }
});

app.post('/api/chats/:chatId/read', async (req, res, next) => {
  try {
    const chatId = chatIdFrom(req);
    const chat = await manager.markRead(chatId);
    if (!chat) throw new HttpError(404, 'Conversa não encontrada.');
    res.json(chat);
  } catch (error) {
    next(error);
  }
});

// ---------------- configurações ----------------
const settingsSchema = z
  .object({
    aiEnabled: z.boolean().optional(),
    baseUrl: z.string().trim().url('Informe uma URL base válida.').max(500).optional(),
    model: z.string().trim().min(1).max(120).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(50).max(4000).optional(),
    businessName: z.string().trim().max(120).optional(),
    assistantName: z.string().trim().min(1).max(80).optional(),
    knowledge: z.string().max(30000).optional(),
    extraInstructions: z.string().max(10000).optional(),
    replyDelayMs: z.number().int().min(0).max(120000).optional(),
    humanPauseMs: z.number().int().min(0).max(7 * 24 * 60 * 60 * 1000).optional(),
    replyGroups: z.boolean().optional(),
    historyLimit: z.number().int().min(2).max(60).optional(),
    maxRepliesPerHour: z.number().int().min(1).max(200).optional(),
    apiKey: z.string().max(500).optional(),
    clearApiKey: z.boolean().optional(),
  })
  .strict();

app.get('/api/settings', (_req, res) => {
  res.json(store.getPublicSettings());
});

app.put('/api/settings', (req, res, next) => {
  try {
    const update = parse(settingsSchema, req.body);
    const settings = store.updateSettings(update);
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

app.post('/api/ai/test', async (_req, res, next) => {
  try {
    const result = await ai.testConnection();
    store.addAiLog({
      kind: 'test',
      detail: `Teste da IA concluído em ${result.latencyMs} ms (${result.model}).`,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof HttpError) next(error);
    else if (error instanceof Error) next(new HttpError(400, error.message));
    else next(error);
  }
});

app.get('/api/ai/logs', (_req, res) => {
  res.json(store.getAiLogs());
});

// ---------------- mídia ----------------
const INLINE_MEDIA = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'mp4',
  '3gp',
  'mov',
  'webm',
  'ogg',
  'mp3',
  'm4a',
  'aac',
]);

app.get('/api/media/:file', (req, res) => {
  const filePath = store.mediaFilePath(req.params.file);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Mídia não encontrada.' });
    return;
  }
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const disposition = INLINE_MEDIA.has(extension) ? 'inline' : 'attachment';
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(filePath)}"`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.sendFile(filePath);
});

// ---------------- SSE ----------------
const sseClients = new Set<Response>();

function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event: string, data: unknown): void {
  for (const client of sseClients) {
    try {
      sendEvent(client, event, data);
    } catch {
      sseClients.delete(client);
    }
  }
}

bus.on('status', data => broadcast('status', data));
bus.on('settings', data => broadcast('settings', data));
bus.on('chat', data => broadcast('chat', data));
bus.on('message', data => broadcast('message', data));
bus.on('message-update', data => broadcast('message-update', data));
bus.on('ai-log', data => broadcast('ai-log', data));
bus.on('sync-complete', data => broadcast('sync-complete', data));

app.get('/api/events', (req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  sseClients.add(res);
  sendEvent(res, 'status', manager.getStatus());
  sendEvent(res, 'settings', store.getPublicSettings());

  req.on('close', () => {
    sseClients.delete(res);
  });
});

const heartbeat = setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': ping\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 25000);
heartbeat.unref?.();

// ---------------- frontend em produção ----------------
if (IS_PROD) {
  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    console.warn('[server] pasta dist/ não encontrada. Rode "npm run build" antes de "npm start".');
  }
}

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo maior que 25 MB.'
        : `Falha no upload: ${error.message}`;
    res.status(400).json({ error: message });
    return;
  }
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Erro interno.';
  if (status >= 500) console.error('[server]', error);
  res.status(status).json({ error: message });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`\n  WhatsAI rodando em http://${HOST}:${PORT}`);
  console.log(IS_PROD ? '  Interface: build de produção' : '  API em modo desenvolvimento (use npm run dev para a interface)');
  void manager.start();
});

server.on('error', error => {
  console.error('[server] não foi possível iniciar:', error.message);
  process.exit(1);
});

function shutdown(): void {
  console.log('\n[server] encerrando...');
  ai.cancelAll();
  manager.stop();
  store.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', error => {
  console.error('[server] exceção não tratada:', error);
});
process.on('unhandledRejection', error => {
  console.error('[server] promise rejeitada sem tratamento:', error);
});

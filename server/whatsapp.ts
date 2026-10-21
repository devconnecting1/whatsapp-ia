import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import pino from 'pino';
import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  getContentType,
  makeWASocket,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
  type proto,
} from '@whiskeysockets/baileys';
import type {
  ChatSummary,
  ConnectionState,
  MediaInfo,
  MediaKind,
  Me,
  Message,
  MessageStatus,
  Status,
  SyncProgress,
} from '../shared/types';
import { AUTH_DIR, MEDIA_DIR, SYNC_FULL_HISTORY } from './config';
import { bus } from './bus';
import {
  Store,
  fallbackNameForJid,
  normalizePhoneJid,
} from './store';

const logger = pino({ level: 'silent' });
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/quicktime': 'mov',
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function toMillis(timestamp: WAMessage['messageTimestamp']): number {
  if (!timestamp) return Date.now();
  const raw = typeof timestamp === 'number'
    ? timestamp
    : typeof (timestamp as { toNumber?: () => number }).toNumber === 'function'
      ? (timestamp as { toNumber: () => number }).toNumber()
      : Number(timestamp);
  if (!Number.isFinite(raw) || raw <= 0) return Date.now();
  return raw < 1e12 ? raw * 1000 : raw;
}

function mapStatus(status: number | null | undefined): MessageStatus | null {
  switch (status) {
    case 0:
      return 'error';
    case 1:
      return 'pending';
    case 2:
      return 'sent';
    case 3:
      return 'delivered';
    case 4:
    case 5:
      return 'read';
    default:
      return null;
  }
}

/** Desembrulha mensagens efêmeras, de visualização única, editadas etc. */
function unwrapMessage(input: proto.IMessage | null | undefined): proto.IMessage | null {
  let current = input ?? null;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const node = current as Record<string, { message?: proto.IMessage } | undefined>;
    const wrapped =
      node.ephemeralMessage?.message ||
      node.viewOnceMessage?.message ||
      node.viewOnceMessageV2?.message ||
      node.viewOnceMessageV2Extension?.message ||
      node.documentWithCaptionMessage?.message ||
      node.editedMessage?.message;
    if (wrapped) {
      current = wrapped;
      continue;
    }
    if (current.deviceSentMessage?.message) {
      current = current.deviceSentMessage.message;
      continue;
    }
    break;
  }
  return current;
}

function extractText(content: proto.IMessage | null): string {
  if (!content) return '';
  const type = getContentType(content);
  if (!type) return '';
  const node = content[type] as Record<string, unknown> | undefined;
  switch (type) {
    case 'conversation':
      return String(content.conversation ?? '');
    case 'extendedTextMessage':
      return String(node?.text ?? '');
    case 'imageMessage':
    case 'videoMessage':
    case 'documentMessage':
    case 'audioMessage':
    case 'ptvMessage':
      return String(node?.caption ?? '');
    case 'buttonsResponseMessage':
      return String(node?.selectedDisplayText ?? node?.selectedButtonId ?? '');
    case 'listResponseMessage':
      return String(node?.title ?? (node?.singleSelectReply as { selectedRowId?: string })?.selectedRowId ?? '');
    case 'templateButtonReplyMessage':
      return String(node?.selectedDisplayText ?? node?.selectedId ?? '');
    case 'pollCreationMessage':
      return `📊 ${String(node?.name ?? 'Enquete')}`;
    default:
      return String(node?.text ?? node?.caption ?? '');
  }
}

function mediaKindFor(type: string): MediaKind | null {
  switch (type) {
    case 'imageMessage':
      return 'image';
    case 'videoMessage':
    case 'ptvMessage':
      return 'video';
    case 'audioMessage':
      return 'audio';
    case 'documentMessage':
      return 'document';
    case 'stickerMessage':
      return 'sticker';
    default:
      return null;
  }
}

function extensionFor(mime: string, fileName?: string): string {
  const fromName = fileName?.includes('.') ? fileName.split('.').pop() : undefined;
  if (fromName && /^[a-zA-Z0-9]{1,6}$/.test(fromName)) return fromName.toLowerCase();
  return MEDIA_EXTENSIONS[mime] ?? 'bin';
}

interface IncomingOptions {
  historical?: boolean;
  silent?: boolean;
}

export class WhatsAppManager {
  private sock: WASocket | null = null;
  private state: ConnectionState = 'disconnected';
  private qr: string | null = null;
  private qrGeneratedAt: number | null = null;
  private me: Me | null = null;
  private connectedAt: number | null = null;
  private lastError: string | null = null;
  private sync: SyncProgress | null = null;
  private starting = false;
  private stopped = true;
  private generation = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  onInbound?: (chatId: string) => void;

  constructor(private readonly store: Store) {}

  getStatus(): Status {
    return {
      state: this.state,
      me: this.me,
      qr: this.qr,
      qrGeneratedAt: this.qrGeneratedAt,
      lastError: this.lastError,
      connectedAt: this.connectedAt,
      sync: this.sync,
    };
  }

  private emitStatus(): void {
    bus.emit('status', this.getStatus());
  }

  private emitChat(chat: ChatSummary | null): void {
    if (chat) bus.emit('chat', chat);
  }

  private emitMessage(message: Message): void {
    bus.emit('message', message);
  }

  async start(force = false): Promise<void> {
    if (this.starting) return;
    if (this.sock && !force && this.state !== 'disconnected') return;

    this.starting = true;
    this.stopped = false;
    this.lastError = null;
    this.reconnectTimer && clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    if (this.sock) {
      const old = this.sock;
      this.sock = null;
      try {
        old.ev.removeAllListeners('connection.update');
        old.end(undefined);
      } catch {
        // socket já encerrado
      }
    }

    this.state = 'connecting';
    this.emitStatus();

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

      let version: [number, number, number] | undefined;
      try {
        const latest = await Promise.race([
          fetchLatestBaileysVersion(),
          sleep(6000).then(() => null),
        ]);
        if (latest && Array.isArray(latest.version)) version = latest.version as [number, number, number];
      } catch {
        version = undefined;
      }

      const generation = ++this.generation;
      const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: SYNC_FULL_HISTORY,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined,
      });

      this.sock = sock;
      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', update => {
        void this.handleConnectionUpdate(update, generation);
      });

      sock.ev.on('messages.upsert', event => {
        if (generation !== this.generation) return;
        void this.handleMessagesUpsert(event.messages, event.type === 'notify' ? 'notify' : 'append');
      });

      sock.ev.on('messages.update', updates => {
        if (generation !== this.generation) return;
        for (const { key, update } of updates) {
          if (!key.remoteJid || !key.id) continue;
          const status = mapStatus(update.status);
          if (!status) continue;
          const updated = this.store.updateMessageStatus(key.remoteJid, key.id, status);
          if (updated) bus.emit('message-update', updated);
        }
      });

      sock.ev.on('messaging-history.set', payload => {
        if (generation !== this.generation) return;
        void this.handleHistorySync(payload);
      });

      sock.ev.on('chats.upsert', chats => {
        if (generation !== this.generation) return;
        for (const chat of chats) this.applyChat(chat);
      });

      sock.ev.on('chats.update', chats => {
        if (generation !== this.generation) return;
        for (const chat of chats) this.applyChat(chat);
      });

      sock.ev.on('contacts.upsert', contacts => {
        if (generation !== this.generation) return;
        for (const contact of contacts) {
          if (!contact.id) continue;
          this.store.upsertContact(contact.id, { name: contact.name ?? undefined, notify: contact.notify ?? undefined });
        }
      });

      sock.ev.on('contacts.update', contacts => {
        if (generation !== this.generation) return;
        for (const contact of contacts) {
          if (!contact.id) continue;
          this.store.upsertContact(contact.id, { name: contact.name ?? undefined, notify: contact.notify ?? undefined });
        }
      });

      sock.ev.on('groups.update', groups => {
        if (generation !== this.generation) return;
        for (const group of groups) {
          if (!group.id) continue;
          const name = group.subject ?? undefined;
          const chat = this.store.updateChatName(group.id, name ?? '');
          if (chat) this.emitChat(chat);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      this.state = 'disconnected';
      console.error('[whatsapp] falha ao iniciar:', message);
      this.emitStatus();
    } finally {
      this.starting = false;
    }
  }

  private async handleConnectionUpdate(
    update: { connection?: string; lastDisconnect?: { error?: unknown }; qr?: string },
    generation: number,
  ): Promise<void> {
    if (generation !== this.generation) return;

    if (update.qr) {
      try {
        this.qr = await QRCode.toDataURL(update.qr, {
          margin: 1,
          width: 340,
          errorCorrectionLevel: 'M',
          color: { dark: '#111b21', light: '#ffffff' },
        });
        this.qrGeneratedAt = Date.now();
        this.state = 'qr';
        this.lastError = null;
        this.emitStatus();
      } catch (error) {
        console.error('[whatsapp] falha ao gerar QR:', error);
      }
    }

    if (update.connection === 'open') {
      const user = this.sock?.user;
      const jid = user?.id ?? '';
      const digits = normalizePhoneJid(jid);
      this.me = {
        id: jid,
        name: user?.name || (digits ? `+${digits}` : 'WhatsApp'),
        number: digits,
      };
      this.state = 'connected';
      this.qr = null;
      this.qrGeneratedAt = null;
      this.connectedAt = Date.now();
      this.lastError = null;
      this.sync = { active: false, processed: 0 };
      console.log(`[whatsapp] conectado como ${this.me.name} (${this.me.number})`);
      this.emitStatus();
      this.emitAllChats();
    }

    if (update.connection === 'close') {
      const error = update.lastDisconnect?.error as
        | { output?: { statusCode?: number }; message?: string }
        | undefined;
      const statusCode = error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const reason = error?.message || 'Conexão encerrada';

      this.sock = null;
      this.me = null;
      this.connectedAt = null;
      this.qr = null;
      this.sync = null;

      if (loggedOut) {
        this.state = 'disconnected';
        this.lastError = 'Sessão encerrada. Conecte novamente lendo o QR Code.';
        await fs.promises.rm(AUTH_DIR, { recursive: true, force: true }).catch(() => undefined);
        this.emitStatus();
        return;
      }

      if (this.stopped) {
        this.state = 'disconnected';
        this.emitStatus();
        return;
      }

      this.state = 'connecting';
      this.lastError = reason;
      this.emitStatus();
      console.warn(`[whatsapp] conexão caiu (${statusCode ?? 'sem código'}): ${reason}. Reconectando...`);
      this.reconnectTimer && clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.stopped && generation === this.generation) void this.start(true);
      }, 2500);
      this.reconnectTimer.unref?.();
    }
  }

  private emitAllChats(): void {
    for (const chat of this.store.listChats()) bus.emit('chat', chat);
  }

  private applyChat(chat: {
    id?: string | null;
    name?: string | null;
    subject?: string | null;
    unreadCount?: number | null;
    conversationTimestamp?: unknown;
    pinned?: number | null;
    muteEndTime?: unknown;
  }): void {
    if (!chat.id) return;
    const isGroup = chat.id.endsWith('@g.us');
    const name = (chat.name || chat.subject || undefined) ?? undefined;
    const timestamp = chat.conversationTimestamp
      ? toMillis(chat.conversationTimestamp as WAMessage['messageTimestamp'])
      : undefined;
    const summary = this.store.upsertChat({
      id: chat.id,
      name,
      isGroup,
      unread: typeof chat.unreadCount === 'number' ? chat.unreadCount : undefined,
      lastMessageAt: timestamp,
      pinned: chat.pinned === 1,
      muted: Boolean(chat.muteEndTime),
    });
    this.emitChat(summary);
  }

  private async handleMessagesUpsert(
    messages: WAMessage[],
    kind: 'notify' | 'append',
  ): Promise<void> {
    for (const raw of messages) {
      try {
        await this.processMessage(raw, { historical: kind === 'append' });
      } catch (error) {
        console.error('[whatsapp] erro ao processar mensagem:', error);
      }
    }
  }

  private async processMessage(raw: WAMessage, options: IncomingOptions): Promise<void> {
    const chatId = raw.key?.remoteJid;
    if (!chatId) return;
    if (chatId === 'status@broadcast' || chatId.endsWith('@broadcast') || chatId.endsWith('@newsletter')) return;
    if (!raw.message) return;

    const content = unwrapMessage(raw.message);
    if (!content) return;
    const type = getContentType(content);
    if (!type) return;
    if (type === 'protocolMessage' || type === 'reactionMessage' || type === 'senderKeyDistributionMessage') return;

    const node = content[type] as Record<string, unknown> | undefined;
    const fromMe = Boolean(raw.key.fromMe);
    const isGroup = chatId.endsWith('@g.us');
    const messageId = raw.key.id || `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timestamp = toMillis(raw.messageTimestamp);
    const historical = Boolean(options.historical || timestamp < Date.now() - 5 * 60 * 1000);
    const text = extractText(content);
    const kind = mediaKindFor(type);
    const mime = String(node?.mimetype ?? node?.mimeType ?? 'application/octet-stream');
    const fileName = node?.fileName ? String(node.fileName) : undefined;

    if (!text && !kind) {
      return;
    }

    if (raw.pushName && !fromMe) {
      this.store.upsertContact(chatId, { notify: raw.pushName });
    }

    const quotedNode = (node?.contextInfo as { quotedMessage?: proto.IMessage } | undefined)?.quotedMessage;
    const quotedText = quotedNode ? extractText(unwrapMessage(quotedNode)) : '';
    const quotedMessage = quotedText
      ? (node?.contextInfo as { quotedMessage?: proto.IMessage; stanzaId?: string } | undefined)
      : undefined;

    const existingChat = this.store.getChat(chatId);
    if (!existingChat) {
      this.store.upsertChat({
        id: chatId,
        name: isGroup ? 'Grupo' : raw.pushName || undefined,
        isGroup,
        lastMessageAt: timestamp,
      });
    }

    const message: Message = {
      id: messageId,
      chatId,
      fromMe,
      senderId: isGroup ? (raw.key.participant ?? undefined) : chatId,
      senderName: fromMe ? 'Você' : raw.pushName ?? undefined,
      participant: raw.key.participant ?? undefined,
      text,
      timestamp,
      status: fromMe ? 'sent' : undefined,
      quoted: quotedMessage
        ? {
            id: String((node?.contextInfo as { stanzaId?: string })?.stanzaId ?? ''),
            text: quotedText,
            fromMe: false,
          }
        : undefined,
    };

    const { message: saved, created } = this.store.addMessage(message);
    if (!created) return;

    const summary = this.store.upsertChat({
      id: chatId,
      unreadDelta: !fromMe && !historical ? 1 : 0,
      lastMessage: text || this.previewForKind(kind, fileName),
      lastMessageAt: timestamp,
    });
    if (!options.silent) {
      this.emitChat(summary);
      this.emitMessage(saved);
    }

    if (fromMe && !historical) {
      const pauseMs = this.store.getPublicSettings().humanPauseMs;
      if (pauseMs > 0) this.store.pauseChat(chatId, pauseMs, 'human');
    }

    if (kind && !historical) {
      void this.downloadAndAttach(saved, raw, content, type, kind, mime, fileName);
    }

    if (!fromMe && !historical) {
      this.onInbound?.(chatId);
    }
  }

  private previewForKind(kind: MediaKind | null, fileName?: string): string {
    switch (kind) {
      case 'image':
        return '📷 Foto';
      case 'video':
        return '🎬 Vídeo';
      case 'audio':
        return '🎤 Áudio';
      case 'sticker':
        return 'Figurinha';
      case 'document':
        return `📄 ${fileName || 'Documento'}`;
      default:
        return '';
    }
  }

  private async downloadAndAttach(
    saved: Message,
    raw: WAMessage,
    content: proto.IMessage,
    type: string,
    kind: MediaKind,
    mime: string,
    fileName?: string,
  ): Promise<void> {
    try {
      const sock = this.sock;
      if (!sock) return;
      const node = (content as Record<string, unknown>)[type] as { fileLength?: unknown } | undefined;
      const fileLength = Number(node?.fileLength ?? 0);
      if (fileLength && fileLength > MAX_MEDIA_BYTES) {
        this.store.addAiLog({
          kind: 'skip',
          chatId: saved.chatId,
          detail: 'Mídia ignorada: arquivo maior que 25 MB.',
        });
        return;
      }

      const buffer = (await Promise.race([
        downloadMediaMessage(raw, 'buffer', {}, {
          logger,
          reuploadRequest: sock.updateMediaMessage,
        }),
        sleep(25000).then(() => null),
      ])) as Buffer | null;

      if (!buffer || !buffer.length) return;

      const extension = extensionFor(mime, fileName);
      const storedName = `${safeId(saved.id)}.${extension}`;
      fs.writeFileSync(path.join(MEDIA_DIR, storedName), buffer);

      const media: MediaInfo = {
        kind,
        mime,
        fileName,
        url: `/api/media/${storedName}`,
        size: buffer.length,
      };
      const updated = this.store.updateMessageMedia(saved.chatId, saved.id, media);
      if (updated) bus.emit('message-update', updated);
    } catch (error) {
      console.warn('[whatsapp] não foi possível baixar mídia:', error);
    }
  }

  private async handleHistorySync(payload: {
    chats: Array<{
      id?: string | null;
      name?: string | null;
      subject?: string | null;
      unreadCount?: number | null;
      conversationTimestamp?: unknown;
      pinned?: number | null;
      muteEndTime?: unknown;
    }>;
    contacts: Array<{ id?: string | null; name?: string | null; notify?: string | null }>;
    messages: WAMessage[];
    isLatest?: boolean;
  }): Promise<void> {
    this.sync = { active: true, processed: 0 };
    this.emitStatus();

    try {
      for (const contact of payload.contacts) {
        if (!contact.id) continue;
        this.store.upsertContact(contact.id, { name: contact.name ?? undefined, notify: contact.notify ?? undefined });
      }

      for (const chat of payload.chats) {
        if (!chat.id) continue;
        const timestamp = chat.conversationTimestamp
          ? toMillis(chat.conversationTimestamp as WAMessage['messageTimestamp'])
          : 0;
        const summary = this.store.upsertChat({
          id: chat.id,
          name: (chat.name || chat.subject) ?? undefined,
          isGroup: chat.id.endsWith('@g.us'),
          unread: typeof chat.unreadCount === 'number' ? chat.unreadCount : 0,
          lastMessageAt: timestamp,
          pinned: chat.pinned === 1,
          muted: Boolean(chat.muteEndTime),
        });
        this.emitChat(summary);
      }

      let processed = 0;
      for (const message of payload.messages) {
        try {
          await this.processMessage(message, { historical: true, silent: true });
        } catch {
          // mensagem individual inválida
        }
        processed += 1;
        if (processed % 100 === 0) {
          this.sync = { active: true, processed };
          this.emitStatus();
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      this.store.flush();
      this.sync = { active: false, processed };
      this.emitStatus();
      this.emitAllChats();
      bus.emit('sync-complete', { ok: true });
      console.log(`[whatsapp] histórico sincronizado: ${processed} mensagens`);
    } catch (error) {
      console.error('[whatsapp] erro na sincronização de histórico:', error);
      this.sync = null;
      this.emitStatus();
    }
  }

  private ensureConnected(): WASocket {
    if (!this.sock || this.state !== 'connected') {
      throw new Error('WhatsApp não está conectado. Leia o QR Code para conectar.');
    }
    return this.sock;
  }

  async sendText(
    chatId: string,
    text: string,
    options?: { aiGenerated?: boolean },
  ): Promise<Message> {
    const sock = this.ensureConnected();
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Mensagem vazia.');

    const sent = await sock.sendMessage(chatId, { text: trimmed });
    const id = sent?.key?.id || `local_${Date.now()}`;
    const timestamp = Date.now();

    const message: Message = {
      id,
      chatId,
      fromMe: true,
      senderName: 'Você',
      text: trimmed,
      timestamp,
      status: 'sent',
      aiGenerated: options?.aiGenerated,
    };

    const { message: saved } = this.store.addMessage(message);
    const summary = this.store.upsertChat({
      id: chatId,
      lastMessage: trimmed,
      lastMessageAt: timestamp,
      unread: 0,
    });
    this.emitChat(summary);
    this.emitMessage(saved);

    if (!options?.aiGenerated) {
      const pauseMs = this.store.getPublicSettings().humanPauseMs;
      if (pauseMs > 0) this.store.pauseChat(chatId, pauseMs, 'human');
    }

    return saved;
  }

  async sendMedia(
    chatId: string,
    buffer: Buffer,
    mime: string,
    fileName: string,
    caption = '',
    options?: { aiGenerated?: boolean },
  ): Promise<Message> {
    const sock = this.ensureConnected();
    if (!buffer.length) throw new Error('Arquivo vazio.');

    let payload: any;
    let kind: MediaKind = 'document';

    if (mime.startsWith('image/')) {
      kind = 'image';
      payload = { image: buffer, mimetype: mime, caption: caption || undefined };
    } else if (mime.startsWith('video/')) {
      kind = 'video';
      payload = { video: buffer, mimetype: mime, caption: caption || undefined };
    } else if (mime.startsWith('audio/')) {
      kind = 'audio';
      payload = { audio: buffer, mimetype: mime, ptt: false };
    } else {
      payload = { document: buffer, mimetype: mime, fileName, caption: caption || undefined };
    }

    const sent = await sock.sendMessage(chatId, payload);
    const id = sent?.key?.id || `local_${Date.now()}`;
    const timestamp = Date.now();
    const extension = extensionFor(mime, fileName);
    const storedName = `${safeId(id)}.${extension}`;
    fs.writeFileSync(path.join(MEDIA_DIR, storedName), buffer);

    const media: MediaInfo = {
      kind,
      mime,
      fileName,
      url: `/api/media/${storedName}`,
      size: buffer.length,
    };

    const message: Message = {
      id,
      chatId,
      fromMe: true,
      senderName: 'Você',
      text: caption,
      timestamp,
      status: 'sent',
      media,
      aiGenerated: options?.aiGenerated,
    };

    const { message: saved } = this.store.addMessage(message);
    const summary = this.store.upsertChat({
      id: chatId,
      lastMessage: caption || this.previewForKind(kind, fileName),
      lastMessageAt: timestamp,
      unread: 0,
    });
    this.emitChat(summary);
    this.emitMessage(saved);

    if (!options?.aiGenerated) {
      const pauseMs = this.store.getPublicSettings().humanPauseMs;
      if (pauseMs > 0) this.store.pauseChat(chatId, pauseMs, 'human');
    }

    return saved;
  }

  async markRead(chatId: string): Promise<ChatSummary | null> {
    const summary = this.store.markChatRead(chatId);
    this.emitChat(summary);

    const sock = this.sock;
    if (!sock || this.state !== 'connected') return summary;

    const lastInbound = [...this.store.getMessages(chatId)]
      .reverse()
      .find(message => !message.fromMe);
    if (!lastInbound) return summary;

    try {
      await sock.readMessages([
        {
          remoteJid: chatId,
          id: lastInbound.id,
          participant: chatId.endsWith('@g.us') ? lastInbound.participant : undefined,
        },
      ]);
    } catch {
      // recibo de leitura é opcional
    }
    return summary;
  }

  async setTyping(chatId: string, typing: boolean): Promise<void> {
    try {
      await this.sock?.sendPresenceUpdate(typing ? 'composing' : 'paused', chatId);
    } catch {
      // presença é opcional
    }
  }

  async restart(): Promise<void> {
    this.stopped = true;
    this.generation += 1;
    const old = this.sock;
    this.sock = null;
    try {
      old?.ev.removeAllListeners('connection.update');
      old?.end(undefined);
    } catch {
      // ignore
    }
    this.state = 'connecting';
    this.qr = null;
    this.qrGeneratedAt = null;
    this.me = null;
    this.connectedAt = null;
    this.lastError = null;
    this.emitStatus();
    await sleep(400);
    await this.start(true);
  }

  async logout(): Promise<void> {
    this.stopped = true;
    this.generation += 1;
    const sock = this.sock;
    this.sock = null;
    try {
      await sock?.logout();
    } catch {
      // ignore
    }
    try {
      sock?.end(undefined);
    } catch {
      // ignore
    }
    this.state = 'disconnected';
    this.me = null;
    this.qr = null;
    this.qrGeneratedAt = null;
    this.connectedAt = null;
    this.lastError = null;
    await fs.promises.rm(AUTH_DIR, { recursive: true, force: true }).catch(() => undefined);
    this.emitStatus();
  }

  stop(): void {
    this.stopped = true;
    this.generation += 1;
    this.reconnectTimer && clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try {
      this.sock?.end(undefined);
    } catch {
      // ignore
    }
    this.sock = null;
    this.state = 'disconnected';
    this.emitStatus();
  }

  getChatFallbackName(chatId: string): string {
    return fallbackNameForJid(chatId);
  }
}

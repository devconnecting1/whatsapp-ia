import fs from 'node:fs';
import path from 'node:path';
import type {
  AiLogEntry,
  ChatSummary,
  MediaInfo,
  Message,
  MessageStatus,
  PublicSettings,
  SettingsUpdate,
} from '../shared/types';
import { DB_FILE, MESSAGES_DIR, MEDIA_DIR, SETTINGS_FILE } from './config';
import { decryptSecret, encryptSecret, hintForSecret } from './crypto';
import { bus } from './bus';

const MAX_MESSAGES_PER_CHAT = 3000;
const MAX_AI_LOGS = 120;

interface StoredChat extends ChatSummary {
  createdAt: number;
}

interface StoredChatSettings {
  aiEnabled?: boolean;
  pausedUntil?: number;
  pauseReason?: 'human' | 'handoff' | 'manual';
}

interface StoredContact {
  id: string;
  name?: string;
  notify?: string;
  lid?: string;
  jid?: string;
}

interface Database {
  version: 1;
  chats: Record<string, StoredChat>;
  chatSettings: Record<string, StoredChatSettings>;
  contacts: Record<string, StoredContact>;
  lidToPhone?: Record<string, string>;
}

interface StoredSettings {
  aiEnabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  businessName: string;
  assistantName: string;
  knowledge: string;
  extraInstructions: string;
  replyDelayMs: number;
  humanPauseMs: number;
  replyGroups: boolean;
  historyLimit: number;
  maxRepliesPerHour: number;
  apiKeyEnc?: string;
  apiKeyHint: string;
}

const DEFAULT_SETTINGS: StoredSettings = {
  aiEnabled: false,
  baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  temperature: 0.6,
  maxTokens: 500,
  businessName: 'Minha Empresa',
  assistantName: 'Assistente',
  knowledge:
    'Descreva aqui o que sua empresa faz, produtos/serviços, preços, horários, endereço e perguntas frequentes. A IA usa este texto para responder os clientes.',
  extraInstructions: '',
  replyDelayMs: 4000,
  humanPauseMs: 15 * 60 * 1000,
  replyGroups: false,
  historyLimit: 20,
  maxRepliesPerHour: 20,
  apiKeyHint: '',
};

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.copyFileSync(tmp, file);
    fs.rmSync(tmp, { force: true });
  }
}

function safeFileName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function emptyDb(): Database {
  return { version: 1, chats: {}, chatSettings: {}, contacts: {}, lidToPhone: {} };
}

export function normalizePhoneJid(jid: string): string {
  const user = jid.split('@')[0]?.split(':')[0] ?? jid;
  return user.replace(/[^0-9]/g, '');
}

function isPlaceholderName(name: string): boolean {
  return /^\+?\d{10,}$/.test(name.trim()) || name === 'Contato não salvo' || name === 'Sem nome';
}

export function isVisibleChat(chat: ChatSummary): boolean {
  if (
    chat.id.endsWith('@newsletter') ||
    chat.id.endsWith('@broadcast') ||
    chat.id === 'status@broadcast' ||
    chat.id === '0@s.whatsapp.net'
  ) {
    return false;
  }
  return chat.lastMessageAt > 0 || chat.lastMessage.trim().length > 0;
}

export function fallbackNameForJid(jid: string): string {
  if (jid.endsWith('@g.us')) return 'Grupo';
  if (jid.endsWith('@newsletter')) return 'Canal';
  if (jid.endsWith('@lid')) return 'Contato não salvo';
  if (jid.endsWith('@broadcast')) return 'Transmissão';
  const digits = normalizePhoneJid(jid);
  if (!digits) return jid;
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return `+${digits}`;
}

export class Store {
  private db: Database;
  private settings: StoredSettings;
  private messageCache = new Map<string, Message[]>();
  private messageTimers = new Map<string, NodeJS.Timeout>();
  private dbTimer: NodeJS.Timeout | null = null;
  private settingsTimer: NodeJS.Timeout | null = null;
  private logs: AiLogEntry[] = [];

  constructor() {
    this.db = readJson<Database>(DB_FILE, emptyDb());
    this.db.chats ??= {};
    this.db.chatSettings ??= {};
    this.db.contacts ??= {};
    this.db.lidToPhone ??= {};
    this.normalizeChatNames();
    this.settings = { ...DEFAULT_SETTINGS, ...readJson<Partial<StoredSettings>>(SETTINGS_FILE, {}) };
  }

  // ---------- settings ----------
  getApiKey(): string {
    if (this.settings.apiKeyEnc) {
      const decrypted = decryptSecret(this.settings.apiKeyEnc);
      if (decrypted) return decrypted;
    }
    return process.env.OPENAI_API_KEY?.trim() ?? '';
  }

  hasApiKey(): boolean {
    return Boolean(this.getApiKey());
  }

  getPublicSettings(): PublicSettings {
    const envHint = process.env.OPENAI_API_KEY?.trim();
    return {
      aiEnabled: this.settings.aiEnabled,
      baseUrl: this.settings.baseUrl,
      model: this.settings.model,
      temperature: this.settings.temperature,
      maxTokens: this.settings.maxTokens,
      businessName: this.settings.businessName,
      assistantName: this.settings.assistantName,
      knowledge: this.settings.knowledge,
      extraInstructions: this.settings.extraInstructions,
      replyDelayMs: this.settings.replyDelayMs,
      humanPauseMs: this.settings.humanPauseMs,
      replyGroups: this.settings.replyGroups,
      historyLimit: this.settings.historyLimit,
      maxRepliesPerHour: this.settings.maxRepliesPerHour,
      apiKeyHint:
        this.settings.apiKeyHint || (envHint ? hintForSecret(envHint) : ''),
      apiKeySet: this.hasApiKey(),
    };
  }

  updateSettings(update: SettingsUpdate): PublicSettings {
    const {
      apiKey,
      clearApiKey,
      ...rest
    } = update;

    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && key in this.settings) {
        (this.settings as unknown as Record<string, unknown>)[key] = value;
      }
    }

    if (clearApiKey) {
      delete this.settings.apiKeyEnc;
      this.settings.apiKeyHint = '';
    } else if (apiKey && apiKey.trim()) {
      const trimmed = apiKey.trim();
      this.settings.apiKeyEnc = encryptSecret(trimmed);
      this.settings.apiKeyHint = hintForSecret(trimmed);
    }

    this.scheduleSettingsSave();
    return this.getPublicSettings();
  }

  // ---------- chats ----------
  private effectiveAi(chatId: string): boolean {
    if (!this.settings.aiEnabled) return false;
    return this.db.chatSettings[chatId]?.aiEnabled ?? true;
  }

  private toSummary(chat: StoredChat): ChatSummary {
    const extra = this.db.chatSettings[chat.id] ?? {};
    const pausedUntil = extra.pausedUntil && extra.pausedUntil > Date.now() ? extra.pausedUntil : null;
    return {
      id: chat.id,
      name: chat.name,
      isGroup: chat.isGroup,
      lastMessage: chat.lastMessage,
      lastMessageAt: chat.lastMessageAt,
      unread: chat.unread,
      aiEnabled: this.effectiveAi(chat.id),
      aiOverride: extra.aiEnabled ?? null,
      pausedUntil,
      pinned: chat.pinned,
      muted: chat.muted,
    };
  }

  getChat(chatId: string): ChatSummary | null {
    const chat = this.db.chats[chatId];
    return chat ? this.toSummary(chat) : null;
  }

  listChats(query?: string): ChatSummary[] {
    const q = query?.trim().toLowerCase();
    const chats = Object.values(this.db.chats)
      .map(chat => this.toSummary(chat))
      .filter(isVisibleChat)
      .filter(chat => chat.lastMessage.trim().length > 0 || this.getMessages(chat.id).length > 0)
      .filter(chat => (q ? chat.name.toLowerCase().includes(q) || chat.lastMessage.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.lastMessageAt - a.lastMessageAt;
      });
    return chats;
  }

  resolveLidPhone(chatId: string): string | null {
    if (!chatId.endsWith('@lid')) return null;
    return this.db.lidToPhone?.[chatId] ?? null;
  }

  getPhoneContactIds(): string[] {
    return Object.keys(this.db.contacts).filter(
      id => id.endsWith('@s.whatsapp.net') && normalizePhoneJid(id).length >= 8,
    );
  }

  private contactNameFor(chatId: string): string | undefined {
    const direct = this.db.contacts[chatId];
    const phone = this.resolveLidPhone(chatId);
    const mapped = phone ? this.db.contacts[phone] : undefined;
    const directName = direct?.name && !isPlaceholderName(direct.name) ? direct.name : undefined;
    const mappedName = mapped?.name && !isPlaceholderName(mapped.name) ? mapped.name : undefined;
    // Nome salvo na agenda sempre vence o pushName.
    return directName || mappedName || direct?.notify || mapped?.notify;
  }

  private refreshChatName(chatId: string): void {
    const chat = this.db.chats[chatId];
    if (!chat || chat.isGroup) return;

    const contactName = this.contactNameFor(chatId);
    const phone = this.resolveLidPhone(chatId);
    const fallback = fallbackNameForJid(phone ?? chatId);
    let nextName = chat.name;

    if (contactName) nextName = contactName;
    else if (isPlaceholderName(chat.name)) nextName = fallback;

    if (nextName !== chat.name) {
      chat.name = nextName;
      bus.emit('chat', this.toSummary(chat));
      this.scheduleDbSave();
    }
  }

  private normalizeChatNames(): void {
    for (const chat of Object.values(this.db.chats)) {
      if (chat.isGroup || chat.id.endsWith('@newsletter') || chat.id.endsWith('@broadcast')) continue;
      const contactName = this.contactNameFor(chat.id);
      const phone = this.resolveLidPhone(chat.id);
      if (contactName) {
        chat.name = contactName;
      } else if (isPlaceholderName(chat.name)) {
        chat.name = fallbackNameForJid(phone ?? chat.id);
      }
    }
  }

  linkLid(lid: string, phoneJid: string): void {
    if (!lid.endsWith('@lid')) return;
    const normalized = phoneJid.split('@')[0]?.split(':')[0];
    if (!normalized || normalized.length < 8) return;
    const phone = `${normalized}@s.whatsapp.net`;
    if (this.db.lidToPhone?.[lid] === phone) return;

    this.db.lidToPhone ??= {};
    this.db.lidToPhone[lid] = phone;
    this.refreshChatName(lid);
    this.scheduleDbSave();
  }

  upsertChat(input: {
    id: string;
    name?: string;
    isGroup?: boolean;
    lastMessage?: string;
    lastMessageAt?: number;
    unread?: number;
    unreadDelta?: number;
    pinned?: boolean;
    muted?: boolean;
  }): ChatSummary {
    const existing = this.db.chats[input.id];
    const isGroup = input.isGroup ?? existing?.isGroup ?? input.id.endsWith('@g.us');
    const contactName = this.contactNameFor(input.id);
    const phone = this.resolveLidPhone(input.id);
    const fallback = fallbackNameForJid(phone ?? input.id);
    const inputName = input.name?.trim();
    const existingName = existing?.name && !isPlaceholderName(existing.name) ? existing.name : undefined;

    const name = isGroup
      ? inputName || existingName || contactName || fallback
      : inputName && !isPlaceholderName(inputName)
        ? inputName
        : contactName || existingName || fallback;

    const chat: StoredChat = existing ?? {
      id: input.id,
      name,
      isGroup,
      lastMessage: '',
      lastMessageAt: 0,
      unread: 0,
      aiEnabled: this.settings.aiEnabled,
      aiOverride: null,
      pausedUntil: null,
      pinned: false,
      muted: false,
      createdAt: Date.now(),
    };

    chat.name = name;
    chat.isGroup = isGroup;
    if (input.lastMessage !== undefined) chat.lastMessage = input.lastMessage;
    if (input.lastMessageAt !== undefined) chat.lastMessageAt = input.lastMessageAt;
    if (input.unread !== undefined) chat.unread = input.unread;
    if (input.unreadDelta) chat.unread = Math.max(0, chat.unread + input.unreadDelta);
    if (input.pinned !== undefined) chat.pinned = input.pinned;
    if (input.muted !== undefined) chat.muted = input.muted;

    this.db.chats[input.id] = chat;
    this.scheduleDbSave();
    return this.toSummary(chat);
  }

  updateChatName(chatId: string, name: string): ChatSummary | null {
    const chat = this.db.chats[chatId];
    if (!chat || !name || chat.name === name) return chat ? this.toSummary(chat) : null;
    chat.name = name;
    this.scheduleDbSave();
    return this.toSummary(chat);
  }

  setChatAi(chatId: string, aiEnabled: boolean | null): ChatSummary | null {
    const chat = this.db.chats[chatId];
    if (!chat) return null;
    const extra = this.db.chatSettings[chatId] ?? {};
    if (aiEnabled === null) {
      delete extra.aiEnabled;
    } else {
      extra.aiEnabled = aiEnabled;
      if (aiEnabled) delete extra.pausedUntil;
    }
    this.db.chatSettings[chatId] = extra;
    this.scheduleDbSave();
    return this.toSummary(chat);
  }

  pauseChat(chatId: string, durationMs: number, reason: 'human' | 'handoff' | 'manual' = 'human'): void {
    if (durationMs <= 0) return;
    const extra = this.db.chatSettings[chatId] ?? {};
    extra.pausedUntil = Date.now() + durationMs;
    extra.pauseReason = reason;
    this.db.chatSettings[chatId] = extra;
    this.scheduleDbSave();
    const summary = this.getChat(chatId);
    if (summary) bus.emit('chat', summary);
  }

  resumeChat(chatId: string): ChatSummary | null {
    const extra = this.db.chatSettings[chatId];
    if (!extra) return this.getChat(chatId);
    delete extra.pausedUntil;
    delete extra.pauseReason;
    this.scheduleDbSave();
    return this.getChat(chatId);
  }

  isChatPaused(chatId: string): boolean {
    const pausedUntil = this.db.chatSettings[chatId]?.pausedUntil;
    return Boolean(pausedUntil && pausedUntil > Date.now());
  }

  markChatRead(chatId: string): ChatSummary | null {
    const chat = this.db.chats[chatId];
    if (!chat) return null;
    chat.unread = 0;
    this.scheduleDbSave();
    return this.toSummary(chat);
  }

  getChatNames(): Map<string, string> {
    return new Map(Object.values(this.db.chats).map(chat => [chat.id, chat.name]));
  }

  upsertContact(
    id: string,
    data: { name?: string; notify?: string; lid?: string; jid?: string },
  ): void {
    const existing = this.db.contacts[id] ?? { id };
    if (data.name) existing.name = data.name;
    if (data.notify) existing.notify = data.notify;
    if (data.lid?.endsWith('@lid')) existing.lid = data.lid;
    if (data.jid?.endsWith('@s.whatsapp.net')) existing.jid = data.jid;
    this.db.contacts[id] = existing;

    const lid =
      id.endsWith('@lid')
        ? id
        : data.lid?.endsWith('@lid')
          ? data.lid
          : undefined;
    const jid =
      id.endsWith('@s.whatsapp.net')
        ? id
        : data.jid?.endsWith('@s.whatsapp.net')
          ? data.jid
          : undefined;

    if (lid && jid) {
      this.linkLid(lid, jid);
    } else if (lid) {
      this.refreshChatName(lid);
    } else {
      this.refreshChatName(id);
      for (const [mappedLid, mappedPhone] of Object.entries(this.db.lidToPhone ?? {})) {
        if (mappedPhone === id) this.refreshChatName(mappedLid);
      }
    }
    this.scheduleDbSave();
  }

  // ---------- messages ----------
  private messageFile(chatId: string): string {
    return path.join(MESSAGES_DIR, `${safeFileName(chatId)}.json`);
  }

  getMessages(chatId: string): Message[] {
    const cached = this.messageCache.get(chatId);
    if (cached) return cached;
    const list = readJson<Message[]>(this.messageFile(chatId), []);
    this.messageCache.set(chatId, list);
    return list;
  }

  getLastMessage(chatId: string): Message | null {
    const list = this.getMessages(chatId);
    return list.length ? list[list.length - 1] : null;
  }

  getMessage(chatId: string, messageId: string): Message | null {
    return this.getMessages(chatId).find(message => message.id === messageId) ?? null;
  }

  addMessage(message: Message): { message: Message; created: boolean } {
    const list = this.getMessages(message.chatId);
    const existing = list.find(item => item.id === message.id);
    if (existing) {
      if (message.media && !existing.media) {
        existing.media = message.media;
        existing.text = existing.text || message.text;
        this.scheduleMessagesSave(message.chatId);
      }
      return { message: existing, created: false };
    }

    let index = list.length;
    while (index > 0 && list[index - 1].timestamp > message.timestamp) index -= 1;
    list.splice(index, 0, message);
    if (list.length > MAX_MESSAGES_PER_CHAT) {
      list.splice(0, list.length - MAX_MESSAGES_PER_CHAT);
    }
    this.scheduleMessagesSave(message.chatId);

    const chat = this.db.chats[message.chatId];
    if (chat) {
      const isNewer = message.timestamp >= chat.lastMessageAt;
      if (isNewer) {
        chat.lastMessageAt = message.timestamp;
        chat.lastMessage = message.text || this.previewForMedia(message.media);
      }
      if (message.fromMe) chat.unread = 0;
      this.scheduleDbSave();
    }

    return { message, created: true };
  }

  updateMessageMedia(chatId: string, messageId: string, media: MediaInfo): Message | null {
    const list = this.getMessages(chatId);
    const message = list.find(item => item.id === messageId);
    if (!message) return null;
    message.media = media;
    this.scheduleMessagesSave(chatId);
    return message;
  }

  updateMessageStatus(chatId: string, messageId: string, status: MessageStatus): Message | null {
    const list = this.getMessages(chatId);
    const message = list.find(item => item.id === messageId);
    if (!message || message.status === status) return message ?? null;
    message.status = status;
    this.scheduleMessagesSave(chatId);
    return message;
  }

  private previewForMedia(media?: MediaInfo): string {
    if (!media) return '';
    switch (media.kind) {
      case 'image':
        return '📷 Foto';
      case 'video':
        return '🎬 Vídeo';
      case 'audio':
        return '🎤 Áudio';
      case 'sticker':
        return 'Figurinha';
      default:
        return `📄 ${media.fileName || 'Documento'}`;
    }
  }

  // ---------- ai logs ----------
  addAiLog(entry: Omit<AiLogEntry, 'id' | 'at'>): AiLogEntry {
    const log: AiLogEntry = { ...entry, id: Math.random().toString(36).slice(2), at: Date.now() };
    this.logs.unshift(log);
    if (this.logs.length > MAX_AI_LOGS) this.logs.length = MAX_AI_LOGS;
    bus.emit('ai-log', log);
    return log;
  }

  getAiLogs(): AiLogEntry[] {
    return this.logs;
  }

  // ---------- persistence ----------
  private scheduleDbSave(): void {
    if (this.dbTimer) return;
    this.dbTimer = setTimeout(() => {
      this.dbTimer = null;
      writeJsonAtomic(DB_FILE, this.db);
    }, 400);
    this.dbTimer.unref?.();
  }

  private scheduleSettingsSave(): void {
    if (this.settingsTimer) return;
    this.settingsTimer = setTimeout(() => {
      this.settingsTimer = null;
      writeJsonAtomic(SETTINGS_FILE, this.settings);
      bus.emit('settings', this.getPublicSettings());
    }, 200);
    this.settingsTimer.unref?.();
  }

  private scheduleMessagesSave(chatId: string): void {
    const existing = this.messageTimers.get(chatId);
    if (existing) return;
    const timer = setTimeout(() => {
      this.messageTimers.delete(chatId);
      const messages = this.messageCache.get(chatId);
      if (messages) writeJsonAtomic(this.messageFile(chatId), messages);
    }, 500);
    timer.unref?.();
    this.messageTimers.set(chatId, timer);
  }

  flush(): void {
    if (this.dbTimer) {
      clearTimeout(this.dbTimer);
      this.dbTimer = null;
    }
    if (this.settingsTimer) {
      clearTimeout(this.settingsTimer);
      this.settingsTimer = null;
    }
    for (const [chatId, timer] of this.messageTimers) {
      clearTimeout(timer);
      const messages = this.messageCache.get(chatId);
      if (messages) writeJsonAtomic(this.messageFile(chatId), messages);
    }
    this.messageTimers.clear();
    writeJsonAtomic(DB_FILE, this.db);
    writeJsonAtomic(SETTINGS_FILE, this.settings);
  }

  mediaFilePath(fileName: string): string | null {
    if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) return null;
    const full = path.join(MEDIA_DIR, fileName);
    const resolved = path.resolve(full);
    if (!resolved.startsWith(path.resolve(MEDIA_DIR) + path.sep)) return null;
    return full;
  }
}

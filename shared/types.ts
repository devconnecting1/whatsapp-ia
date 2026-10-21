export type ConnectionState = 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface Me {
  id: string;
  name: string;
  number: string;
}

export interface SyncProgress {
  active: boolean;
  processed: number;
}

export interface Status {
  state: ConnectionState;
  me: Me | null;
  qr: string | null;
  qrGeneratedAt: number | null;
  lastError: string | null;
  connectedAt: number | null;
  sync: SyncProgress | null;
}

export interface ChatSummary {
  id: string;
  name: string;
  isGroup: boolean;
  lastMessage: string;
  lastMessageAt: number;
  unread: number;
  aiEnabled: boolean;
  aiOverride: boolean | null;
  pausedUntil: number | null;
  pinned: boolean;
  muted: boolean;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface MediaInfo {
  kind: MediaKind;
  mime: string;
  fileName?: string;
  url: string;
  size?: number;
}

export interface QuotedMessage {
  id: string;
  text: string;
  fromMe: boolean;
}

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'error';

export interface Message {
  id: string;
  chatId: string;
  fromMe: boolean;
  senderId?: string;
  senderName?: string;
  participant?: string;
  text: string;
  timestamp: number;
  status?: MessageStatus;
  aiGenerated?: boolean;
  media?: MediaInfo;
  quoted?: QuotedMessage;
}

export interface PublicSettings {
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
  apiKeyHint: string;
  apiKeySet: boolean;
}

export interface SettingsUpdate {
  aiEnabled?: boolean;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  businessName?: string;
  assistantName?: string;
  knowledge?: string;
  extraInstructions?: string;
  replyDelayMs?: number;
  humanPauseMs?: number;
  replyGroups?: boolean;
  historyLimit?: number;
  maxRepliesPerHour?: number;
  apiKey?: string;
  clearApiKey?: boolean;
}

export type AiLogKind = 'reply' | 'skip' | 'error' | 'handoff' | 'test';

export interface AiLogEntry {
  id: string;
  at: number;
  kind: AiLogKind;
  chatId?: string;
  chatName?: string;
  detail: string;
  reply?: string;
}

export interface ChatUpdate {
  aiEnabled?: boolean | null;
  pausedUntil?: number | null;
}

export interface SendMessageResponse {
  message: Message;
}

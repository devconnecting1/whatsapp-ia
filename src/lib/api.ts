import type {
  AiLogEntry,
  ChatSummary,
  Message,
  PublicSettings,
  SendMessageResponse,
  SettingsUpdate,
  Status,
} from '@shared/types';

export const API_BASE = '/api';

/** Erro de API com a mensagem devolvida pelo backend. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface OkResponse {
  ok: true;
}

export interface AiTestResponse {
  ok: true;
  reply: string;
  model: string;
  latencyMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(payload: unknown, response: Response): string {
  if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }
  const statusText = response.statusText?.trim();
  return statusText || `Falha na requisição (HTTP ${response.status}).`;
}

/**
 * Executa uma requisição e devolve o JSON tipado.
 * Em respostas 204 (ou sem corpo) devolve undefined.
 */
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Verifique se ele está em execução.', 0);
  }

  const raw = await response.text();
  let payload: unknown = null;
  let parsed = false;

  if (raw) {
    try {
      payload = JSON.parse(raw);
      parsed = true;
    } catch {
      payload = raw;
    }
  }

  if (!response.ok) {
    throw new ApiError(getErrorMessage(payload, response), response.status);
  }

  if (response.status === 204 || !raw) {
    return undefined as T;
  }

  if (!parsed) {
    throw new Error('O servidor retornou uma resposta inválida.');
  }

  return payload as T;
}

function jsonOptions(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const api = {
  getStatus: () => request<Status>(`${API_BASE}/status`),

  getSettings: () => request<PublicSettings>(`${API_BASE}/settings`),

  updateSettings: (update: SettingsUpdate) =>
    request<PublicSettings>(`${API_BASE}/settings`, jsonOptions('PUT', update)),

  getChats: (query?: string) => {
    const q = query?.trim();
    return request<ChatSummary[]>(`${API_BASE}/chats${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  },

  getMessages: (chatId: string, limit = 300) =>
    request<Message[]>(
      `${API_BASE}/chats/${encodeURIComponent(chatId)}/messages?limit=${encodeURIComponent(String(limit))}`,
    ),

  sendText: (chatId: string, text: string) =>
    request<SendMessageResponse>(
      `${API_BASE}/chats/${encodeURIComponent(chatId)}/send`,
      jsonOptions('POST', { text }),
    ),

  sendMedia: (chatId: string, file: File, caption?: string) => {
    const form = new FormData();
    form.append('file', file);
    const trimmedCaption = caption?.trim();
    if (trimmedCaption) form.append('caption', trimmedCaption);

    return request<SendMessageResponse>(
      `${API_BASE}/chats/${encodeURIComponent(chatId)}/send-media`,
      { method: 'POST', body: form },
    );
  },

  setChatAi: (chatId: string, aiEnabled: boolean | null) =>
    request<ChatSummary>(
      `${API_BASE}/chats/${encodeURIComponent(chatId)}`,
      jsonOptions('PATCH', { aiEnabled }),
    ),

  markRead: (chatId: string) =>
    request<ChatSummary>(`${API_BASE}/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST' }),

  connect: () => request<OkResponse>(`${API_BASE}/connect`, { method: 'POST' }),

  restart: () => request<OkResponse>(`${API_BASE}/restart`, { method: 'POST' }),

  logout: () => request<OkResponse>(`${API_BASE}/logout`, { method: 'POST' }),

  testAi: () => request<AiTestResponse>(`${API_BASE}/ai/test`, { method: 'POST' }),

  getAiLogs: () => request<AiLogEntry[]>(`${API_BASE}/ai/logs`),
};

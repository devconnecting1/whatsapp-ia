import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiLogEntry,
  ChatSummary,
  Message,
  PublicSettings,
  SettingsUpdate,
  Status,
} from '@shared/types';
import { API_BASE, api, type AiTestResponse } from '@/lib/api';

const ACTIVE_CHAT_KEY = 'whatsapp-ia:active-chat';
const MESSAGES_LIMIT = 300;
const MAX_AI_LOGS = 120;
const MARK_READ_DELAY_MS = 600;
const CHATS_REFRESH_DELAY_MS = 800;

function compareChats(a: ChatSummary, b: ChatSummary): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.lastMessageAt - a.lastMessageAt;
}

function sortChats(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort(compareChats);
}

function previewOf(message: Message): string {
  if (message.text.trim()) return message.text;

  switch (message.media?.kind) {
    case 'image':
      return '📷 Foto';
    case 'video':
      return '🎬 Vídeo';
    case 'audio':
      return '🎤 Áudio';
    case 'sticker':
      return 'Figurinha';
    case 'document':
      return `📄 ${message.media.fileName || 'Documento'}`;
    default:
      return '';
  }
}

function insertMessage(list: Message[], message: Message): Message[] {
  const existingIndex = list.findIndex(item => item.id === message.id);
  if (existingIndex !== -1) {
    const next = [...list];
    next[existingIndex] = message;
    return next;
  }

  let index = list.length;
  while (index > 0 && list[index - 1].timestamp > message.timestamp) index -= 1;
  return [...list.slice(0, index), message, ...list.slice(index)];
}

/** Mantém mensagens que chegaram por SSE enquanto o histórico era carregado. */
function mergeMessages(fetched: Message[], current: Message[]): Message[] {
  if (current.length === 0) return fetched;

  const byId = new Map<string, Message>();
  for (const message of fetched) byId.set(message.id, message);
  for (const message of current) {
    if (!byId.has(message.id)) byId.set(message.id, message);
  }

  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function replaceMessage(list: Message[], message: Message): Message[] {
  let changed = false;
  const next = list.map(item => {
    if (item.id !== message.id) return item;
    changed = true;
    return message;
  });
  return changed ? next : list;
}

function mergeAiLogs(incoming: AiLogEntry[], current: AiLogEntry[]): AiLogEntry[] {
  const byId = new Map<string, AiLogEntry>();
  for (const entry of current) byId.set(entry.id, entry);
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX_AI_LOGS);
}

function readStoredChatId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

function storeChatId(chatId: string | null): void {
  try {
    if (chatId) window.localStorage.setItem(ACTIVE_CHAT_KEY, chatId);
    else window.localStorage.removeItem(ACTIVE_CHAT_KEY);
  } catch {
    // localStorage indisponível: segue sem persistir
  }
}

function disconnectedStatus(): Status {
  return {
    state: 'disconnected',
    me: null,
    qr: null,
    qrGeneratedAt: null,
    lastError: null,
    connectedAt: null,
    sync: null,
  };
}

function parseSse<T>(event: Event): T | null {
  try {
    const messageEvent = event as MessageEvent<string>;
    return JSON.parse(messageEvent.data) as T;
  } catch {
    return null;
  }
}

function listenSse<T>(source: EventSource, name: string, apply: (data: T) => void): () => void {
  const handler = (event: Event) => {
    const data = parseSse<T>(event);
    if (data !== null) apply(data);
  };
  source.addEventListener(name, handler);
  return () => source.removeEventListener(name, handler);
}

export interface UseWhatsAppResult {
  status: Status | null;
  settings: PublicSettings | null;
  chats: ChatSummary[];
  activeChatId: string | null;
  activeChat: ChatSummary | null;
  messages: Message[];
  loadingChats: boolean;
  loadingMessages: boolean;
  sending: boolean;
  aiLogs: AiLogEntry[];
  selectChat: (chatId: string | null) => Promise<void>;
  sendText: (text: string) => Promise<void>;
  sendMedia: (file: File, caption?: string) => Promise<void>;
  setChatAi: (enabled: boolean | null) => Promise<void>;
  setActiveChatAi: (enabled: boolean | null) => Promise<void>;
  saveSettings: (update: SettingsUpdate) => Promise<PublicSettings>;
  testAi: () => Promise<AiTestResponse>;
  connect: () => Promise<void>;
  restart: () => Promise<void>;
  logout: () => Promise<void>;
  refreshChats: () => Promise<void>;
  refreshLogs: () => Promise<void>;
}

export function useWhatsApp(): UseWhatsAppResult {
  const [status, setStatus] = useState<Status | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiLogs, setAiLogs] = useState<AiLogEntry[]>([]);

  const statusRef = useRef<Status | null>(null);
  const settingsRef = useRef<PublicSettings | null>(null);
  const chatsRef = useRef<ChatSummary[]>([]);
  const activeChatIdRef = useRef<string | null>(null);
  const restoredChatRef = useRef(false);
  const loadedChatIdRef = useRef<string | null>(null);

  const chatsEpochRef = useRef(0);
  const chatsRequestRef = useRef(0);
  const chatsLoadsRef = useRef(0);
  const messagesRequestRef = useRef(0);
  const loadingChatIdRef = useRef<string | null>(null);
  const sendingCountRef = useRef(0);

  const markReadTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const chatsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateChats = useCallback((updater: (previous: ChatSummary[]) => ChatSummary[]) => {
    const previous = chatsRef.current;
    const next = updater(previous);
    if (next === previous) return;
    chatsRef.current = next;
    setChats(next);
  }, []);

  const upsertChat = useCallback(
    (chat: ChatSummary) => {
      updateChats(previous => {
        const exists = previous.some(item => item.id === chat.id);
        const next = exists
          ? previous.map(item => (item.id === chat.id ? chat : item))
          : [...previous, chat];
        return sortChats(next);
      });
    },
    [updateChats],
  );

  const applyMessageToChats = useCallback(
    (message: Message, isActive: boolean) => {
      updateChats(previous => {
        let found = false;
        const next = previous.map(chat => {
          if (chat.id !== message.chatId) return chat;
          found = true;

          const isNewer = message.timestamp >= chat.lastMessageAt;
          return {
            ...chat,
            lastMessage: isNewer ? previewOf(message) : chat.lastMessage,
            lastMessageAt: isNewer ? message.timestamp : chat.lastMessageAt,
            // O servidor já envia o evento `chat` com o unread atualizado antes
            // do evento `message`; incrementar aqui contaria duas vezes.
            unread: isActive || message.fromMe ? 0 : chat.unread,
          };
        });

        return found ? sortChats(next) : previous;
      });
    },
    [updateChats],
  );

  const clearMarkReadTimers = useCallback(() => {
    for (const timer of markReadTimersRef.current.values()) clearTimeout(timer);
    markReadTimersRef.current.clear();
  }, []);

  const clearChatsRefreshTimer = useCallback(() => {
    if (chatsRefreshTimerRef.current !== null) {
      clearTimeout(chatsRefreshTimerRef.current);
      chatsRefreshTimerRef.current = null;
    }
  }, []);

  /** Agenda uma leitura por conversa, coalescendo rajadas de mensagens. */
  const scheduleMarkRead = useCallback(
    (chatId: string) => {
      if (markReadTimersRef.current.has(chatId)) return;

      const timer = setTimeout(() => {
        markReadTimersRef.current.delete(chatId);
        if (activeChatIdRef.current !== chatId) return;

        void api
          .markRead(chatId)
          .then(chat => upsertChat(chat))
          .catch(() => {
            // silencioso: a próxima mensagem tenta novamente
          });
      }, MARK_READ_DELAY_MS);

      markReadTimersRef.current.set(chatId, timer);
    },
    [upsertChat],
  );

  const refreshChats = useCallback(async () => {
    const requestId = ++chatsRequestRef.current;
    const epoch = chatsEpochRef.current;

    chatsLoadsRef.current += 1;
    setLoadingChats(true);

    try {
      const list = await api.getChats();
      if (epoch !== chatsEpochRef.current || requestId !== chatsRequestRef.current) return;

      const sorted = sortChats(list);
      chatsRef.current = sorted;
      setChats(sorted);
    } finally {
      chatsLoadsRef.current = Math.max(0, chatsLoadsRef.current - 1);
      if (chatsLoadsRef.current === 0 && epoch === chatsEpochRef.current) {
        setLoadingChats(false);
      }
    }
  }, []);

  const scheduleChatsRefresh = useCallback(() => {
    if (chatsRefreshTimerRef.current !== null) return;

    chatsRefreshTimerRef.current = setTimeout(() => {
      chatsRefreshTimerRef.current = null;
      void refreshChats().catch(() => {});
    }, CHATS_REFRESH_DELAY_MS);
  }, [refreshChats]);

  const refreshLogs = useCallback(async () => {
    const logs = await api.getAiLogs();
    setAiLogs(previous => mergeAiLogs(logs, previous));
  }, []);

  /**
   * Recarrega as mensagens da conversa aberta sem exibir o skeleton e sem
   * mexer na posição de rolagem. Usado ao terminar a sincronização inicial.
   */
  const refreshActiveMessages = useCallback(async () => {
    const chatId = activeChatIdRef.current;
    if (!chatId || loadingChatIdRef.current === chatId) return;

    try {
      const list = await api.getMessages(chatId, MESSAGES_LIMIT);
      if (activeChatIdRef.current !== chatId) return;
      setMessages(previous => mergeMessages(list, previous));
      loadedChatIdRef.current = chatId;
    } catch (error) {
      console.error('[useWhatsApp] falha ao atualizar mensagens', error);
    }
  }, []);

  const applyStatus = useCallback(
    (next: Status) => {
      const previous = statusRef.current;
      statusRef.current = next;
      setStatus(next);

      if (previous && previous.state !== 'connected' && next.state === 'connected') {
        void refreshChats().catch(error => {
          console.error('[useWhatsApp] falha ao recarregar conversas', error);
        });
      }
    },
    [refreshChats],
  );

  const applySettings = useCallback(
    (next: PublicSettings) => {
      const previous = settingsRef.current;
      settingsRef.current = next;
      setSettings(next);

      // O padrão global de IA altera o aiEnabled efetivo de várias conversas.
      if (previous && previous.aiEnabled !== next.aiEnabled) {
        void refreshChats().catch(error => {
          console.error('[useWhatsApp] falha ao recarregar conversas', error);
        });
      }
    },
    [refreshChats],
  );

  const applyMessage = useCallback(
    (message: Message) => {
      const isActive = activeChatIdRef.current === message.chatId;

      if (isActive) {
        setMessages(previous => insertMessage(previous, message));
        applyMessageToChats(message, true);
        if (!message.fromMe) scheduleMarkRead(message.chatId);
        return;
      }

      const exists = chatsRef.current.some(chat => chat.id === message.chatId);
      if (!exists) {
        scheduleChatsRefresh();
        return;
      }

      applyMessageToChats(message, false);
    },
    [applyMessageToChats, scheduleChatsRefresh, scheduleMarkRead],
  );

  const applyMessageUpdate = useCallback(
    (message: Message) => {
      if (activeChatIdRef.current === message.chatId) {
        setMessages(previous => replaceMessage(previous, message));
      }

      updateChats(previous => {
        let changed = false;
        const next = previous.map(chat => {
          if (chat.id !== message.chatId || message.timestamp < chat.lastMessageAt) return chat;
          changed = true;
          return {
            ...chat,
            lastMessage: previewOf(message),
            lastMessageAt: message.timestamp,
          };
        });
        return changed ? next : previous;
      });
    },
    [updateChats],
  );

  const applyAiLog = useCallback((entry: AiLogEntry) => {
    setAiLogs(previous => {
      if (previous.some(item => item.id === entry.id)) return previous;
      return [entry, ...previous].slice(0, MAX_AI_LOGS);
    });
  }, []);

  const refreshStatus = useCallback(async () => {
    const next = await api.getStatus();
    applyStatus(next);
  }, [applyStatus]);

  const selectChat = useCallback(
    async (chatId: string | null) => {
      const previousId = activeChatIdRef.current;
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
      storeChatId(chatId);

      if (!chatId) {
        messagesRequestRef.current += 1;
        loadingChatIdRef.current = null;
        loadedChatIdRef.current = null;
        setMessages([]);
        setLoadingMessages(false);
        return;
      }

      // Clicar na conversa que já está aberta não deve recarregar nem piscar
      // o skeleton. Uma nova carga só acontece ao trocar de conversa.
      if (
        previousId === chatId &&
        (loadedChatIdRef.current === chatId || loadingChatIdRef.current === chatId)
      ) {
        return;
      }

      if (previousId !== chatId) {
        loadedChatIdRef.current = null;
        setMessages([]);
      }

      // Limpa o contador local e confirma a leitura no servidor.
      const currentChat = chatsRef.current.find(chat => chat.id === chatId);
      if (currentChat && currentChat.unread !== 0) {
        updateChats(previous =>
          previous.map(chat => (chat.id === chatId ? { ...chat, unread: 0 } : chat)),
        );
      }

      void api
        .markRead(chatId)
        .then(chat => upsertChat(chat))
        .catch(() => {
          // a UI já zerou localmente; o servidor tentará de novo na próxima mensagem
        });

      if (loadingChatIdRef.current === chatId) return;

      const requestId = ++messagesRequestRef.current;
      loadingChatIdRef.current = chatId;
      setLoadingMessages(true);

      try {
        const list = await api.getMessages(chatId, MESSAGES_LIMIT);
        if (activeChatIdRef.current !== chatId || messagesRequestRef.current !== requestId) return;
        setMessages(previous => mergeMessages(list, previous));
        loadedChatIdRef.current = chatId;
      } catch (error) {
        if (activeChatIdRef.current === chatId && messagesRequestRef.current === requestId) {
          console.error('[useWhatsApp] falha ao carregar mensagens', error);
        }
      } finally {
        if (messagesRequestRef.current === requestId) {
          loadingChatIdRef.current = null;
          setLoadingMessages(false);
        }
      }
    },
    [updateChats, upsertChat],
  );

  const sendText = useCallback(
    async (text: string) => {
      const chatId = activeChatIdRef.current;
      if (!chatId) throw new Error('Selecione uma conversa antes de enviar.');

      const trimmed = text.trim();
      if (!trimmed) return;

      sendingCountRef.current += 1;
      setSending(true);

      try {
        const { message } = await api.sendText(chatId, trimmed);
        if (activeChatIdRef.current === chatId) {
          setMessages(previous => insertMessage(previous, message));
        }
        applyMessageToChats(message, activeChatIdRef.current === chatId);
      } finally {
        sendingCountRef.current = Math.max(0, sendingCountRef.current - 1);
        if (sendingCountRef.current === 0) setSending(false);
      }
    },
    [applyMessageToChats],
  );

  const sendMedia = useCallback(
    async (file: File, caption?: string) => {
      const chatId = activeChatIdRef.current;
      if (!chatId) throw new Error('Selecione uma conversa antes de enviar.');

      sendingCountRef.current += 1;
      setSending(true);

      try {
        const { message } = await api.sendMedia(chatId, file, caption);
        if (activeChatIdRef.current === chatId) {
          setMessages(previous => insertMessage(previous, message));
        }
        applyMessageToChats(message, activeChatIdRef.current === chatId);
      } finally {
        sendingCountRef.current = Math.max(0, sendingCountRef.current - 1);
        if (sendingCountRef.current === 0) setSending(false);
      }
    },
    [applyMessageToChats],
  );

  const setChatAi = useCallback(
    async (enabled: boolean | null) => {
      const chatId = activeChatIdRef.current;
      if (!chatId) throw new Error('Selecione uma conversa antes de alterar a IA.');

      const chat = await api.setChatAi(chatId, enabled);
      upsertChat(chat);
    },
    [upsertChat],
  );

  const saveSettings = useCallback(
    async (update: SettingsUpdate) => {
      const next = await api.updateSettings(update);
      applySettings(next);
      return next;
    },
    [applySettings],
  );

  const testAi = useCallback(() => api.testAi(), []);

  const connect = useCallback(async () => {
    await api.connect();
  }, []);

  const restart = useCallback(async () => {
    await api.restart();
  }, []);

  const logout = useCallback(async () => {
    await api.logout();

    clearMarkReadTimers();
    clearChatsRefreshTimer();

    chatsEpochRef.current += 1;
    chatsRequestRef.current += 1;
    chatsLoadsRef.current = 0;
    messagesRequestRef.current += 1;
    loadingChatIdRef.current = null;
    loadedChatIdRef.current = null;

    const nextStatus = disconnectedStatus();
    statusRef.current = nextStatus;
    setStatus(nextStatus);

    chatsRef.current = [];
    setChats([]);
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setMessages([]);
    setLoadingChats(false);
    setLoadingMessages(false);
    storeChatId(null);
  }, [clearChatsRefreshTimer, clearMarkReadTimers]);

  // Carga inicial: busca status, configurações, conversas e logs.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const next = await api.getStatus();
        if (!cancelled) applyStatus(next);
      } catch (error) {
        if (!cancelled) console.error('[useWhatsApp] falha ao carregar status', error);
      }
    })();

    void (async () => {
      try {
        const next = await api.getSettings();
        if (!cancelled) applySettings(next);
      } catch (error) {
        if (!cancelled) console.error('[useWhatsApp] falha ao carregar configurações', error);
      }
    })();

    void (async () => {
      try {
        await refreshChats();
      } catch (error) {
        if (!cancelled) console.error('[useWhatsApp] falha ao carregar conversas', error);
      }
    })();

    void (async () => {
      try {
        const logs = await api.getAiLogs();
        if (!cancelled) setAiLogs(previous => mergeAiLogs(logs, previous));
      } catch (error) {
        if (!cancelled) console.error('[useWhatsApp] falha ao carregar logs da IA', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySettings, applyStatus, refreshChats]);

  // Restaura a última conversa aberta quando a lista estiver disponível.
  useEffect(() => {
    if (restoredChatRef.current || chats.length === 0) return;
    restoredChatRef.current = true;

    if (activeChatIdRef.current) return;

    const saved = readStoredChatId();
    if (saved && chats.some(chat => chat.id === saved)) {
      void selectChat(saved);
    }
  }, [chats, selectChat]);

  // SSE: mantém o painel sincronizado em tempo real.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    const source = new EventSource(`${API_BASE}/events`);

    const disposers = [
      listenSse<Status>(source, 'status', applyStatus),
      listenSse<PublicSettings>(source, 'settings', applySettings),
      listenSse<ChatSummary>(source, 'chat', upsertChat),
      listenSse<Message>(source, 'message', applyMessage),
      listenSse<Message>(source, 'message-update', applyMessageUpdate),
      listenSse<AiLogEntry>(source, 'ai-log', applyAiLog),
      // Fim da sincronização inicial: atualiza a lista e as mensagens da
      // conversa aberta em segundo plano, sem reiniciar o carregamento visual.
      listenSse<{ ok: boolean }>(source, 'sync-complete', () => {
        void refreshChats().catch(() => {});
        void refreshActiveMessages();
      }),
    ];

    // O navegador reconecta sozinho; ao reabrir, ressincroniza o estado.
    source.onopen = () => {
      void refreshStatus().catch(() => {});
      void refreshChats().catch(() => {});
    };

    return () => {
      source.onopen = null;
      for (const dispose of disposers) dispose();
      source.close();
    };
  }, [
    applyAiLog,
    applyMessage,
    applyMessageUpdate,
    applySettings,
    applyStatus,
    refreshActiveMessages,
    refreshChats,
    refreshStatus,
    selectChat,
    upsertChat,
  ]);

  // Limpa timers pendentes ao desmontar.
  useEffect(() => {
    return () => {
      clearMarkReadTimers();
      clearChatsRefreshTimer();
    };
  }, [clearChatsRefreshTimer, clearMarkReadTimers]);

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  return {
    status,
    settings,
    chats,
    activeChatId,
    activeChat,
    messages,
    loadingChats,
    loadingMessages,
    sending,
    aiLogs,
    selectChat,
    sendText,
    sendMedia,
    setChatAi,
    setActiveChatAi: setChatAi,
    saveSettings,
    testAi,
    connect,
    restart,
    logout,
    refreshChats,
    refreshLogs,
  };
}

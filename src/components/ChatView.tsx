import { ArrowLeft, Loader2, QrCode, RotateCcw, Settings, Sparkles, WifiOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ChatSummary, Message, Status } from '@shared/types';
import { Composer } from '@/components/Composer';
import { EmptyChat } from '@/components/EmptyChat';
import { MessageBubble } from '@/components/MessageBubble';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { formatDaySeparator, isSameDay } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ChatViewProps {
  chat: ChatSummary | null;
  status: Status | null;
  messages: Message[];
  loading: boolean;
  sending: boolean;
  globalAiEnabled: boolean;
  onSend: (text: string) => Promise<void>;
  onSendMedia: (file: File) => Promise<void>;
  onToggleAi: (enabled: boolean) => Promise<void>;
  onResume: () => Promise<void>;
  onOpenSettings: () => void;
  onBack: () => void;
  onConnect: () => void;
  className?: string;
}

function DateSeparator({ timestamp }: { timestamp: number }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-md bg-white/90 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-wide text-wa-subtle shadow-sm">
        {formatDaySeparator(timestamp)}
      </span>
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-2 py-4">
      <div className="flex justify-start">
        <div className="h-12 w-56 animate-pulse rounded-lg rounded-tl-none bg-white/80" />
      </div>
      <div className="flex justify-end">
        <div className="h-14 w-64 animate-pulse rounded-lg rounded-tr-none bg-wa-bubble/70" />
      </div>
      <div className="flex justify-start">
        <div className="h-10 w-44 animate-pulse rounded-lg rounded-tl-none bg-white/80" />
      </div>
      <div className="flex justify-end">
        <div className="h-20 w-72 animate-pulse rounded-lg rounded-tr-none bg-wa-bubble/70" />
      </div>
    </div>
  );
}

export function ChatView({
  chat,
  status,
  messages,
  loading,
  sending,
  globalAiEnabled,
  onSend,
  onSendMedia,
  onToggleAi,
  onResume,
  onOpenSettings,
  onBack,
  onConnect,
  className,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousChatId = useRef<string | null>(null);
  const connected = status?.state === 'connected';
  const paused = Boolean(chat?.pausedUntil && chat.pausedUntil > Date.now());

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const chatChanged = previousChatId.current !== (chat?.id ?? null);
    previousChatId.current = chat?.id ?? null;
    if (chatChanged) {
      element.scrollTop = element.scrollHeight;
      return;
    }
    const last = messages[messages.length - 1];
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 240;
    if (nearBottom || last?.fromMe) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, chat?.id]);

  if (!chat) {
    return (
      <section className={cn('hidden h-full min-w-0 flex-1 md:flex', className)}>
        <EmptyChat status={status} onConnect={onConnect} onOpenSettings={onOpenSettings} />
      </section>
    );
  }

  return (
    <section className={cn('flex h-full min-w-0 flex-1 flex-col bg-wa-canvas', className)}>
      <header className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-wa-line bg-[#f0f2f5] px-2.5 md:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-wa-subtle md:hidden"
          onClick={onBack}
        >
          <ArrowLeft className="size-5" />
        </Button>

        <UserAvatar name={chat.name} id={chat.id} size="sm" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold text-wa-ink">{chat.name}</h2>
            {chat.isGroup && (
              <span className="shrink-0 rounded bg-black/[0.06] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-wa-subtle">
                Grupo
              </span>
            )}
          </div>
          <p className="truncate text-[11.5px] text-wa-subtle">
            {paused
              ? 'IA pausada — você assumiu o atendimento'
              : chat.aiEnabled
                ? 'IA respondendo automaticamente'
                : 'IA desativada nesta conversa'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full border border-wa-line bg-white px-2 py-1',
              !globalAiEnabled && 'opacity-60',
            )}
            title={!globalAiEnabled ? 'Ative a IA em Ajustes para usar nesta conversa' : 'IA desta conversa'}
          >
            <Sparkles className={cn('size-3.5', chat.aiEnabled && !paused ? 'text-wa-green' : 'text-wa-subtle')} />
            <span className="hidden text-[10.5px] font-semibold uppercase tracking-wide text-wa-subtle sm:inline">
              IA
            </span>
            <Switch
              checked={chat.aiEnabled}
              disabled={!globalAiEnabled}
              onCheckedChange={checked => void onToggleAi(checked)}
              aria-label="Ativar IA nesta conversa"
            />
          </div>

          {paused && globalAiEnabled && (
            <Button
              variant="outline"
              size="sm"
              className="hidden h-8 rounded-full bg-white text-[11px] sm:inline-flex"
              onClick={() => void onResume()}
            >
              <RotateCcw className="mr-1 size-3" />
              Reativar
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-wa-subtle hover:bg-black/[0.05]"
            onClick={onOpenSettings}
            title="Ajustes da IA"
          >
            <Settings className="size-[18px]" />
          </Button>
        </div>
      </header>

      {!connected && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          <WifiOff className="size-3.5" />
          WhatsApp desconectado — as mensagens não serão enviadas.
          <button type="button" onClick={onConnect} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
            <QrCode className="size-3" />
            Conectar
          </button>
        </div>
      )}

      {connected && !globalAiEnabled && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          <Sparkles className="size-3.5" />
          A IA está desativada globalmente.
          <button type="button" onClick={onOpenSettings} className="font-semibold underline-offset-2 hover:underline">
            Ativar em Ajustes
          </button>
        </div>
      )}

      {connected && globalAiEnabled && paused && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          <Sparkles className="size-3.5" />
          Você respondeu manualmente, então a IA pausou nesta conversa.
          <button
            type="button"
            onClick={() => void onResume()}
            className="font-semibold underline-offset-2 hover:underline"
          >
            Reativar agora
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-6"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(17,27,33,0.10) 1px, transparent 0)',
          backgroundSize: '26px 26px',
        }}
      >
        <div className="mx-auto flex w-full max-w-[900px] flex-col">
          {loading ? (
            <MessagesSkeleton />
          ) : messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center justify-center gap-2 py-16 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-white/80 text-wa-subtle shadow-sm">
                <Sparkles className="size-5" />
              </div>
              <p className="text-sm font-medium text-wa-ink">Nenhuma mensagem ainda</p>
              <p className="max-w-xs text-xs leading-relaxed text-wa-subtle">
                {chat.aiEnabled
                  ? 'Quando o cliente enviar uma mensagem, a IA poderá responder automaticamente.'
                  : 'Envie a primeira mensagem ou ative a IA para esta conversa.'}
              </p>
            </div>
          ) : (
            messages.map((message, index) => {
              const previous = messages[index - 1];
              const showDate = !previous || !isSameDay(previous.timestamp, message.timestamp);
              return (
                <div key={message.id}>
                  {showDate && <DateSeparator timestamp={message.timestamp} />}
                  <MessageBubble message={message} isGroup={chat.isGroup} />
                </div>
              );
            })
          )}
        </div>
      </div>

      <Composer
        disabled={!connected}
        sending={sending}
        onSend={onSend}
        onSendMedia={onSendMedia}
        onConnect={onConnect}
      />
    </section>
  );
}

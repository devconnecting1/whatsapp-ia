import { Loader2, LogOut, QrCode, Search, Settings, Sparkles } from 'lucide-react';
import type { ChatSummary, Status } from '@shared/types';
import { ChatListItem } from '@/components/ChatListItem';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

interface SidebarProps {
  status: Status | null;
  chats: ChatSummary[];
  activeChatId: string | null;
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onSelect: (chatId: string) => void;
  onOpenSettings: () => void;
  onConnect: () => void;
  onLogout: () => void;
  className?: string;
}

function statusLabel(status: Status | null): string {
  if (!status) return 'Carregando...';
  switch (status.state) {
    case 'connected':
      return 'Conectado';
    case 'qr':
      return 'Aguardando leitura do QR';
    case 'connecting':
      return 'Conectando...';
    default:
      return 'Desconectado';
  }
}

export function Sidebar({
  status,
  chats,
  activeChatId,
  search,
  loading,
  onSearch,
  onSelect,
  onOpenSettings,
  onConnect,
  onLogout,
  className,
}: SidebarProps) {
  const connected = status?.state === 'connected';
  const me = status?.me;

  return (
    <aside className={cn('flex h-full w-full flex-col border-r border-wa-line bg-white', className)}>
      <div className="flex h-[60px] shrink-0 items-center gap-2.5 bg-wa-teal px-3 text-white">
        <UserAvatar
          name={me?.name ?? 'WhatsAI'}
          id={me?.id ?? 'whatsai'}
          size="sm"
          className="ring-2 ring-white/25"
        />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14px] font-semibold">{me?.name ?? 'WhatsAI'}</p>
          <p className="truncate text-[11px] text-white/70">
            {me ? formatPhone(me.number) : statusLabel(status)}
          </p>
        </div>

        {!connected && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={onConnect}
              >
                <QrCode className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Conectar WhatsApp</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={onOpenSettings}
            >
              <Settings className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ajustes da IA</TooltipContent>
        </Tooltip>

        {connected && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={onLogout}
              >
                <LogOut className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Desconectar WhatsApp</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="border-b border-wa-line bg-white p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-wa-subtle" />
          <Input
            value={search}
            onChange={event => onSearch(event.target.value)}
            placeholder="Pesquisar conversa"
            className="h-9 rounded-lg border-0 bg-[#f0f2f5] pl-9 text-[13px] focus-visible:ring-1"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && chats.length === 0 ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex animate-pulse items-center gap-3 px-1 py-3">
                <div className="size-11 rounded-full bg-black/[0.06]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 rounded bg-black/[0.07]" />
                  <div className="h-2.5 w-3/4 rounded bg-black/[0.05]" />
                </div>
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-wa-panel text-wa-subtle">
              <Search className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-wa-ink">
                {search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-wa-subtle">
                {search
                  ? 'Tente outro nome ou mensagem.'
                  : connected
                    ? 'As conversas aparecem aqui conforme as mensagens chegam. A sincronização inicial pode levar alguns minutos.'
                    : 'Conecte seu WhatsApp lendo o QR Code para ver suas conversas.'}
              </p>
            </div>
            {!connected && !search && (
              <Button size="sm" className="mt-1 bg-wa-green text-white hover:bg-wa-green/90" onClick={onConnect}>
                <QrCode className="mr-1.5 size-4" />
                Conectar WhatsApp
              </Button>
            )}
          </div>
        ) : (
          chats.map(chat => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              active={chat.id === activeChatId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-wa-line bg-[#f0f2f5] px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-wa-subtle">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              connected
                ? 'bg-wa-light'
                : status?.state === 'connecting' || status?.state === 'qr'
                  ? 'animate-pulse bg-amber-400'
                  : 'bg-gray-400',
            )}
          />
          {status?.sync?.active ? (
            <span className="flex items-center gap-1 truncate">
              <Loader2 className="size-3 animate-spin" />
              Sincronizando {status.sync.processed}
            </span>
          ) : (
            <span className="truncate">{statusLabel(status)}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px] font-medium text-wa-teal hover:bg-black/[0.04]"
          onClick={onOpenSettings}
        >
          <Sparkles className="mr-1 size-3.5" />
          IA
        </Button>
      </div>
    </aside>
  );
}

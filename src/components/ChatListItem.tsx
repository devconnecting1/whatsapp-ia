import { Sparkles } from 'lucide-react';
import type { ChatSummary } from '@shared/types';
import { UserAvatar } from '@/components/UserAvatar';
import { formatChatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ChatListItemProps {
  chat: ChatSummary;
  active: boolean;
  onSelect: (chatId: string) => void;
}

export function ChatListItem({ chat, active, onSelect }: ChatListItemProps) {
  const paused = Boolean(chat.pausedUntil);
  return (
    <button
      type="button"
      onClick={() => onSelect(chat.id)}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
        active ? 'bg-[#f0f2f5]' : 'bg-white hover:bg-[#f5f6f6]',
      )}
    >
      <UserAvatar name={chat.name} id={chat.id} />
      <div className="min-w-0 flex-1 border-b border-wa-line/70 pb-2.5 -mb-2.5">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-wa-ink">{chat.name}</p>
          <span
            className={cn(
              'shrink-0 text-[11px]',
              chat.unread > 0 ? 'font-semibold text-wa-light' : 'text-wa-subtle',
            )}
          >
            {formatChatTime(chat.lastMessageAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[13px] text-wa-subtle">
            {chat.lastMessage || 'Sem mensagens'}
          </p>
          {chat.isGroup && (
            <span className="shrink-0 rounded bg-black/[0.06] px-1 py-0.5 text-[9px] font-semibold uppercase text-wa-subtle">
              Grupo
            </span>
          )}
          {chat.aiEnabled && (
            <span
              className={cn(
                'shrink-0',
                paused ? 'text-amber-500' : 'text-wa-green',
              )}
              title={paused ? 'IA pausada nesta conversa' : 'IA ativa nesta conversa'}
            >
              <Sparkles className="size-3.5" />
            </span>
          )}
          {chat.unread > 0 && (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-wa-light px-1.5 text-[10px] font-bold text-white">
              {chat.unread > 99 ? '99+' : chat.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

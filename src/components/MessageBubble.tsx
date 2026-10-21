import { AlertCircle, Check, CheckCheck, Clock, Download, FileText, Sparkles } from 'lucide-react';
import type { Message } from '@shared/types';
import { formatFileSize, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  isGroup: boolean;
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="underline decoration-1 underline-offset-2 hover:opacity-80"
      >
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function StatusIcon({ message }: { message: Message }) {
  if (!message.fromMe) return null;
  switch (message.status) {
    case 'pending':
      return <Clock className="size-3.5" aria-label="Enviando" />;
    case 'error':
      return <AlertCircle className="size-3.5 text-red-500" aria-label="Erro" />;
    case 'read':
      return <CheckCheck className="size-3.5 text-sky-500" aria-label="Lida" />;
    case 'delivered':
      return <CheckCheck className="size-3.5" aria-label="Entregue" />;
    default:
      return <Check className="size-3.5" aria-label="Enviada" />;
  }
}

function MediaContent({ message }: { message: Message }) {
  const media = message.media;
  if (!media) return null;

  if (media.kind === 'image' || media.kind === 'sticker') {
    return (
      <a href={media.url} target="_blank" rel="noreferrer noopener" className="block">
        <img
          src={media.url}
          alt={media.fileName ?? 'Imagem recebida'}
          loading="lazy"
          className={cn(
            'max-h-80 w-auto max-w-full rounded-md object-cover',
            media.kind === 'sticker' && 'max-h-36 bg-transparent',
          )}
        />
      </a>
    );
  }

  if (media.kind === 'video') {
    return (
      <video
        src={media.url}
        controls
        preload="metadata"
        className="max-h-80 w-full max-w-sm rounded-md bg-black/10"
      />
    );
  }

  if (media.kind === 'audio') {
    return (
      <div className="py-0.5">
        <audio src={media.url} controls preload="metadata" className="h-9 w-[260px] max-w-full" />
      </div>
    );
  }

  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-2.5 rounded-md bg-black/[0.04] px-2.5 py-2 transition hover:bg-black/[0.07]"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/80 text-wa-teal">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{media.fileName ?? 'Documento'}</span>
        <span className="block text-[11px] text-wa-subtle">
          {formatFileSize(media.size) || 'Arquivo'}
        </span>
      </span>
      <Download className="size-4 shrink-0 text-wa-subtle" />
    </a>
  );
}

export function MessageBubble({ message, isGroup }: MessageBubbleProps) {
  const showSender = isGroup && !message.fromMe && Boolean(message.senderName);
  const hasMedia = Boolean(message.media);

  return (
    <div
      className={cn(
        'flex w-full px-1 animate-fade-in',
        message.fromMe ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'relative max-w-[86%] rounded-lg px-2 pb-1.5 pt-1.5 text-[14.5px] leading-[1.35] shadow-sm sm:max-w-[75%]',
          message.fromMe
            ? 'rounded-tr-none bg-wa-bubble text-wa-ink'
            : 'rounded-tl-none bg-white text-wa-ink',
        )}
      >
        {showSender && (
          <p className="mb-0.5 truncate text-[12px] font-semibold text-wa-teal">
            {message.senderName}
          </p>
        )}

        {message.quoted && message.quoted.text && (
          <div className="mb-1 rounded-md border-l-[3px] border-wa-light bg-black/[0.05] px-2 py-1">
            <p className="text-[11px] font-medium text-wa-teal">
              {message.quoted.fromMe ? 'Você' : message.senderName ?? 'Mensagem'}
            </p>
            <p className="line-clamp-2 text-[12px] text-wa-subtle">{message.quoted.text}</p>
          </div>
        )}

        {hasMedia && <MediaContent message={message} />}

        {message.text && (
          <p className="whitespace-pre-wrap break-words px-0.5">
            {linkify(message.text)}
          </p>
        )}

        <div
          className={cn(
            'mt-0.5 flex items-center justify-end gap-1 pl-6 text-[10.5px] leading-none text-wa-subtle',
            hasMedia && !message.text && 'absolute bottom-1.5 right-1.5 rounded-full bg-white/80 px-1.5 py-0.5',
          )}
        >
          {message.aiGenerated && (
            <span
              className="flex items-center gap-0.5 rounded-full bg-wa-teal/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-wa-teal"
              title="Resposta gerada pela IA"
            >
              <Sparkles className="size-2.5" />
              IA
            </span>
          )}
          <span>{formatTime(message.timestamp)}</span>
          <StatusIcon message={message} />
        </div>
      </div>
    </div>
  );
}

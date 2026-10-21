import { Loader2, Paperclip, Send, Smile, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ComposerProps {
  disabled: boolean;
  sending: boolean;
  onSend: (text: string) => Promise<void>;
  onSendMedia: (file: File) => Promise<void>;
  onConnect?: () => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export function Composer({ disabled, sending, onSend, onSendMedia, onConnect }: ComposerProps) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, [text]);

  async function submit() {
    const value = text.trim();
    if (!value || disabled || sending || uploading) return;
    try {
      await onSend(value);
      setText('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.');
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Arquivo maior que 25 MB.');
      return;
    }
    setUploading(true);
    try {
      await onSendMedia(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-wa-line bg-[#f0f2f5] px-2 py-2 md:px-4">
      {disabled && (
        <div className="mb-2 flex items-center justify-center gap-2 rounded-md bg-white px-3 py-1.5 text-[11px] text-wa-subtle">
          <WifiOff className="size-3.5" />
          WhatsApp desconectado.
          {onConnect && (
            <button type="button" onClick={onConnect} className="font-semibold text-wa-teal hover:underline">
              Conectar agora
            </button>
          )}
        </div>
      )}
      <div className="mx-auto flex w-full max-w-[900px] items-end gap-1.5">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={event => void handleFile(event)}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mb-0.5 size-10 shrink-0 rounded-full text-wa-subtle hover:bg-black/[0.05]"
          title="Enviar arquivo"
          disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5 -rotate-45" />}
        </Button>

        <div className="flex min-h-10 flex-1 items-end rounded-lg bg-white px-3 py-1.5 shadow-sm">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={disabled ? 'Conecte o WhatsApp para enviar mensagens' : 'Digite uma mensagem'}
            className="max-h-[120px] min-h-8 w-full resize-none bg-transparent py-0.5 text-[14.5px] leading-6 text-wa-ink outline-none placeholder:text-wa-subtle/80 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            tabIndex={-1}
            className="mb-1 ml-1 shrink-0 text-wa-subtle/70"
            title="Emojis"
            onClick={() => {
              setText(current => `${current}😊`);
              textareaRef.current?.focus();
            }}
          >
            <Smile className="size-5" />
          </button>
        </div>

        <Button
          type="button"
          size="icon"
          onClick={() => void submit()}
          disabled={disabled || !text.trim() || sending || uploading}
          className={cn(
            'mb-0.5 size-10 shrink-0 rounded-full bg-wa-green text-white shadow-sm hover:bg-[#1fb457]',
          )}
          title="Enviar mensagem"
        >
          {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-[18px]" />}
        </Button>
      </div>
    </div>
  );
}

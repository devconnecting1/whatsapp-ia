import { QrCode, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import type { Status } from '@shared/types';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { formatPhone } from '@/lib/format';

interface EmptyChatProps {
  status: Status | null;
  onConnect: () => void;
  onOpenSettings: () => void;
}

export function EmptyChat({ status, onConnect, onOpenSettings }: EmptyChatProps) {
  const connected = status?.state === 'connected';
  const waiting = status?.state === 'qr' || status?.state === 'connecting';

  const title = connected
    ? 'Escolha uma conversa'
    : waiting
      ? 'Quase lá...'
      : 'Seu WhatsApp com IA';

  const description = connected
    ? 'Selecione uma conversa à esquerda para ver as mensagens e responder. A IA pode responder automaticamente por você.'
    : waiting
      ? 'Leia o QR Code com o seu celular para conectar a conta. O painel atualiza sozinho quando a conexão for concluída.'
      : 'Conecte sua conta pelo QR Code e tenha suas conversas em um painel próprio, com respostas automáticas de IA.';

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-y-auto bg-wa-canvas px-6 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(17,27,33,0.12) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="relative z-10 w-full max-w-xl text-center">
        <Logo className="justify-center" iconClassName="size-14 rounded-3xl" showWordmark={false} />
        <div className="mt-4 flex items-center justify-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-wa-ink md:text-3xl">WhatsAI</h1>
          <span className="rounded-full bg-wa-green/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-wa-teal">
            beta
          </span>
        </div>
        <h2 className="mt-4 text-lg font-medium text-wa-ink">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-wa-subtle">{description}</p>

        {connected ? (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-wa-line bg-white px-3 py-1.5 text-xs text-wa-subtle shadow-sm">
            <span className="size-2 rounded-full bg-wa-light" />
            Conectado como {status?.me ? formatPhone(status.me.number) : 'WhatsApp'}
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button
              className="h-10 rounded-full bg-wa-green px-5 text-white hover:bg-[#1fb457]"
              onClick={onConnect}
            >
              <QrCode className="mr-2 size-4" />
              {waiting ? 'Ver QR Code' : 'Conectar WhatsApp'}
            </Button>
            <Button variant="outline" className="h-10 rounded-full bg-white" onClick={onOpenSettings}>
              <Sparkles className="mr-2 size-4" />
              Configurar IA
            </Button>
          </div>
        )}

        <div className="mt-10 grid gap-3 text-left sm:grid-cols-3">
          {[
            {
              icon: Zap,
              title: 'Respostas na hora',
              text: 'A IA responde seus clientes automaticamente, 24 horas por dia.',
            },
            {
              icon: Sparkles,
              title: 'Seu jeito de falar',
              text: 'Configure tom, informações da empresa e regras de atendimento.',
            },
            {
              icon: ShieldCheck,
              title: 'Você no controle',
              text: 'Assuma a conversa quando quiser. A IA pausa sozinha ao você responder.',
            },
          ].map(item => (
            <div key={item.title} className="rounded-xl border border-wa-line/80 bg-white/80 p-3.5 shadow-sm backdrop-blur">
              <item.icon className="size-4 text-wa-teal" />
              <p className="mt-2 text-[12.5px] font-semibold text-wa-ink">{item.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-wa-subtle">{item.text}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[10.5px] leading-relaxed text-wa-subtle/80">
          Seus dados ficam no seu computador. Conexão não oficial via WhatsApp Web.
        </p>
      </div>
    </div>
  );
}

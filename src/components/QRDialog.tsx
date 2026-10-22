import { CheckCircle2, Loader2, LogOut, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Status } from '@shared/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatPhone } from '@/lib/format';

interface QRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: Status | null;
  onRestart: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export function QRDialog({ open, onOpenChange, status, onRestart, onLogout }: QRDialogProps) {
  const [busy, setBusy] = useState<'restart' | 'logout' | null>(null);
  const connected = status?.state === 'connected';
  const hasQr = Boolean(status?.qr) && status?.state === 'qr';

  useEffect(() => {
    if (!open) setBusy(null);
  }, [open]);

  async function handleRestart() {
    setBusy('restart');
    try {
      await onRestart();
      toast.success('Gerando um novo QR Code...');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar o QR.');
    } finally {
      setBusy(null);
    }
  }

  async function handleLogout() {
    if (!window.confirm('Desconectar esta conta do WhatsApp? Você precisará ler o QR Code novamente.')) return;
    setBusy('logout');
    try {
      await onLogout();
      toast.success('WhatsApp desconectado.');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível desconectar.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(900px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0">
        <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5 shrink-0 text-wa-teal" />
            {connected ? 'WhatsApp conectado' : 'Conectar WhatsApp'}
          </DialogTitle>
          <DialogDescription className="max-w-md">
            {connected
              ? 'Sua conta está conectada e sincronizando as conversas.'
              : 'Use o WhatsApp do seu celular para ler o código e conectar a conta.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)] md:items-stretch">
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-wa-line bg-[#f8faf9] p-4">
              {connected ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="grid size-16 place-items-center rounded-full bg-emerald-50 text-wa-green">
                    <CheckCircle2 className="size-9" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-wa-ink">Tudo pronto!</p>
                    <p className="mt-1 text-sm text-wa-subtle">
                      {status?.me ? `Conectado como ${formatPhone(status.me.number)}` : 'Conta conectada.'}
                    </p>
                  </div>
                </div>
              ) : hasQr && status?.qr ? (
                <img
                  src={status.qr}
                  alt="QR Code para conectar o WhatsApp"
                  className="size-[260px] max-w-full rounded-lg bg-white p-1 shadow-sm"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-center text-wa-subtle">
                  <Loader2 className="size-7 animate-spin text-wa-teal" />
                  <div>
                    <p className="text-sm font-medium text-wa-ink">
                      {status?.lastError ? 'Tentando conectar...' : 'Gerando QR Code...'}
                    </p>
                    <p className="mt-1 text-xs">Isso leva alguns segundos.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              {connected ? (
                <>
                  <div>
                    <p className="text-sm font-semibold text-wa-ink">Conexão ativa</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-wa-subtle">
                      As conversas já podem ser recebidas e a IA pode responder conforme os ajustes.
                    </p>
                  </div>
                  <Button
                    className="w-fit bg-wa-green text-white hover:bg-[#1fb457]"
                    onClick={() => onOpenChange(false)}
                  >
                    Ir para o painel
                  </Button>
                </>
              ) : (
                <>
                  {status?.lastError && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
                      {status.lastError}
                    </p>
                  )}

                  <div className="space-y-2.5 rounded-lg bg-wa-panel px-3.5 py-3">
                    <p className="flex items-start gap-2 text-[12px] leading-relaxed text-wa-ink">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-wa-teal text-[10px] font-bold text-white">
                        1
                      </span>
                      Abra o WhatsApp no seu celular.
                    </p>
                    <p className="flex items-start gap-2 text-[12px] leading-relaxed text-wa-ink">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-wa-teal text-[10px] font-bold text-white">
                        2
                      </span>
                      Toque em <span className="font-semibold">Configurações</span> e depois em{' '}
                      <span className="font-semibold">Dispositivos conectados</span>.
                    </p>
                    <p className="flex items-start gap-2 text-[12px] leading-relaxed text-wa-ink">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-wa-teal text-[10px] font-bold text-white">
                        3
                      </span>
                      Toque em <span className="font-semibold">Conectar dispositivo</span> e aponte a câmera para o
                      código.
                    </p>
                  </div>

                  <p className="flex items-center gap-1.5 text-[10.5px] leading-relaxed text-wa-subtle">
                    <Smartphone className="size-3.5 shrink-0" />
                    O código expira em alguns minutos. Use "Gerar novo QR" se precisar.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t px-5 py-3">
          <div>
            {connected && (
              <Button variant="outline" size="sm" onClick={() => void handleLogout()} disabled={busy !== null}>
                {busy === 'logout' ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <LogOut className="mr-1.5 size-4" />
                )}
                Desconectar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!connected && (
              <Button variant="outline" size="sm" onClick={() => void handleRestart()} disabled={busy !== null}>
                {busy === 'restart' ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 size-4" />
                )}
                Gerar novo QR
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

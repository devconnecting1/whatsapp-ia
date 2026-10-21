import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { AiLogEntry, AiLogKind, PublicSettings, SettingsUpdate } from '@shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PublicSettings | null;
  logs: AiLogEntry[];
  onSave: (update: SettingsUpdate) => Promise<unknown>;
  onTest: () => Promise<{ reply: string; model: string; latencyMs: number }>;
}

interface Draft {
  aiEnabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  businessName: string;
  assistantName: string;
  knowledge: string;
  extraInstructions: string;
  replyDelaySeconds: number;
  humanPauseMinutes: number;
  replyGroups: boolean;
  historyLimit: number;
  maxRepliesPerHour: number;
  apiKey: string;
  clearApiKey: boolean;
}

const LOG_STYLES: Record<AiLogKind, { label: string; className: string }> = {
  reply: { label: 'Respondeu', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  handoff: { label: 'Transferiu', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  skip: { label: 'Ignorou', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  error: { label: 'Erro', className: 'border-red-200 bg-red-50 text-red-700' },
  test: { label: 'Teste', className: 'border-sky-200 bg-sky-50 text-sky-700' },
};

function toDraft(settings: PublicSettings): Draft {
  return {
    aiEnabled: settings.aiEnabled,
    baseUrl: settings.baseUrl,
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    businessName: settings.businessName,
    assistantName: settings.assistantName,
    knowledge: settings.knowledge,
    extraInstructions: settings.extraInstructions,
    replyDelaySeconds: Math.round(settings.replyDelayMs / 1000),
    humanPauseMinutes: Math.round(settings.humanPauseMs / 60000),
    replyGroups: settings.replyGroups,
    historyLimit: settings.historyLimit,
    maxRepliesPerHour: settings.maxRepliesPerHour,
    apiKey: '',
    clearApiKey: false,
  };
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-wa-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-wa-teal/10 text-wa-teal">
          <Icon className="size-4" />
        </span>
        <div>
          <h3 className="text-[13.5px] font-semibold text-wa-ink">{title}</h3>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-wa-subtle">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[11.5px] font-medium text-wa-ink">{label}</Label>
      {children}
      {hint && <p className="text-[10.5px] leading-relaxed text-wa-subtle">{hint}</p>}
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  logs,
  onSave,
  onTest,
}: SettingsDialogProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ reply: string; model: string; latencyMs: number } | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraft(settings ? toDraft(settings) : null);
      setTestResult(null);
    }
    wasOpenRef.current = open;
  }, [open, settings]);

  // As configurações podem chegar depois de o diálogo abrir.
  useEffect(() => {
    if (open && settings && !draft) setDraft(toDraft(settings));
  }, [open, settings, draft]);

  function patch(update: Partial<Draft>) {
    setDraft(current => (current ? { ...current, ...update } : current));
  }

  async function persist(): Promise<boolean> {
    if (!draft) return false;
    const update: SettingsUpdate = {
      aiEnabled: draft.aiEnabled,
      baseUrl: draft.baseUrl,
      model: draft.model,
      temperature: draft.temperature,
      maxTokens: draft.maxTokens,
      businessName: draft.businessName,
      assistantName: draft.assistantName,
      knowledge: draft.knowledge,
      extraInstructions: draft.extraInstructions,
      replyDelayMs: Math.round(draft.replyDelaySeconds * 1000),
      humanPauseMs: Math.round(draft.humanPauseMinutes * 60000),
      replyGroups: draft.replyGroups,
      historyLimit: draft.historyLimit,
      maxRepliesPerHour: draft.maxRepliesPerHour,
      clearApiKey: draft.clearApiKey,
    };
    if (draft.apiKey.trim()) update.apiKey = draft.apiKey.trim();

    setSaving(true);
    try {
      await onSave(update);
      setDraft(current => (current ? { ...current, apiKey: '', clearApiKey: false } : current));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar os ajustes.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const ok = await persist();
    if (ok) {
      toast.success('Ajustes salvos.');
      onOpenChange(false);
    }
  }

  async function handleTest() {
    const ok = await persist();
    if (!ok) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest();
      setTestResult(result);
      toast.success(`IA respondeu em ${result.latencyMs} ms.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao testar a IA.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-wa-teal" />
            Inteligência artificial
          </DialogTitle>
          <DialogDescription>
            Configure como a IA responde seus clientes no WhatsApp. As alterações valem para novas mensagens.
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div
                  className={cn(
                    'flex items-start justify-between gap-4 rounded-xl border p-4',
                    draft.aiEnabled ? 'border-emerald-200 bg-emerald-50/60' : 'border-wa-line bg-wa-panel',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
                        draft.aiEnabled ? 'bg-wa-green text-white' : 'bg-black/[0.06] text-wa-subtle',
                      )}
                    >
                      <Bot className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-wa-ink">Respostas automáticas</p>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-wa-subtle">
                        {draft.aiEnabled
                          ? 'Ativa. A IA responde mensagens recebidas conforme as regras abaixo.'
                          : 'Desativada. Você continuará recebendo as mensagens, mas a IA não responderá.'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={draft.aiEnabled}
                    onCheckedChange={checked => patch({ aiEnabled: checked })}
                    aria-label="Ativar respostas automáticas"
                  />
                </div>

                <Section
                  icon={Sparkles}
                  title="Provedor de IA"
                  description="Funciona com OpenAI, OpenRouter, Groq, Ollama e qualquer API compatível com ChatGPT."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="URL base da API" hint="OpenAI: https://api.openai.com/v1">
                      <Input
                        value={draft.baseUrl}
                        onChange={event => patch({ baseUrl: event.target.value })}
                        placeholder="https://api.openai.com/v1"
                        spellCheck={false}
                      />
                    </Field>
                    <Field label="Modelo" hint="Ex.: gpt-4o-mini, gpt-4.1-mini, llama-3.3-70b">
                      <Input
                        value={draft.model}
                        onChange={event => patch({ model: event.target.value })}
                        placeholder="gpt-4o-mini"
                        spellCheck={false}
                      />
                    </Field>
                  </div>

                  <div className="mt-3">
                    <Field
                      label="Chave da API"
                      hint={
                        draft.clearApiKey
                          ? 'A chave salva será removida quando você salvar.'
                          : settings?.apiKeySet
                            ? `Chave configurada (${settings.apiKeyHint}). Deixe em branco para manter.`
                            : 'Sua chave fica criptografada apenas neste computador.'
                      }
                    >
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          autoComplete="off"
                          value={draft.apiKey}
                          onChange={event => patch({ apiKey: event.target.value, clearApiKey: false })}
                          placeholder={settings?.apiKeySet ? '••••••••••••••••' : 'sk-...'}
                          className="flex-1"
                        />
                        {settings?.apiKeySet && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Remover chave salva"
                            className={cn(draft.clearApiKey && 'border-red-200 bg-red-50 text-red-600')}
                            onClick={() => patch({ clearApiKey: !draft.clearApiKey, apiKey: '' })}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </Field>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleTest()}
                      disabled={testing || saving}
                    >
                      {testing ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <TestTube2 className="mr-1.5 size-3.5" />
                      )}
                      Testar conexão
                    </Button>
                    {testResult && (
                      <span className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                        <CheckCircle2 className="size-3.5" />
                        {testResult.model} · {testResult.latencyMs} ms · “{testResult.reply}”
                      </span>
                    )}
                  </div>
                </Section>

                <Section
                  icon={MessageSquareText}
                  title="Personalidade e conhecimento"
                  description="Quanto mais claro o contexto, melhor a IA atende. Ela nunca deve inventar informações."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nome da empresa">
                      <Input
                        value={draft.businessName}
                        onChange={event => patch({ businessName: event.target.value })}
                        placeholder="Minha Empresa"
                      />
                    </Field>
                    <Field label="Nome do assistente">
                      <Input
                        value={draft.assistantName}
                        onChange={event => patch({ assistantName: event.target.value })}
                        placeholder="Assistente"
                      />
                    </Field>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <Field
                      label="Informações da empresa / perguntas frequentes"
                      hint="Produtos, preços, horários, endereço, políticas, formas de pagamento, links etc."
                    >
                      <Textarea
                        value={draft.knowledge}
                        onChange={event => patch({ knowledge: event.target.value })}
                        rows={7}
                        placeholder="Ex.: Somos uma loja de suplementos. Atendemos de segunda a sábado, das 9h às 19h..."
                        className="resize-y"
                      />
                    </Field>
                    <Field label="Instruções extras (opcional)" hint="Tom de voz, o que evitar, como tratar descontos...">
                      <Textarea
                        value={draft.extraInstructions}
                        onChange={event => patch({ extraInstructions: event.target.value })}
                        rows={3}
                        placeholder="Ex.: Trate todos por 'você'. Nunca ofereça desconto sem eu autorizar."
                        className="resize-y"
                      />
                    </Field>
                  </div>
                </Section>

                <Section
                  icon={ShieldCheck}
                  title="Comportamento"
                  description="Controle o ritmo das respostas e quando a IA deve sair de cena."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Espera (segundos)" hint="Aguarda para juntar mensagens.">
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        value={draft.replyDelaySeconds}
                        onChange={event => patch({ replyDelaySeconds: Number(event.target.value) || 0 })}
                      />
                    </Field>
                    <Field label="Pausa após você responder" hint="Em minutos.">
                      <Input
                        type="number"
                        min={0}
                        max={10080}
                        value={draft.humanPauseMinutes}
                        onChange={event => patch({ humanPauseMinutes: Number(event.target.value) || 0 })}
                      />
                    </Field>
                    <Field label="Histórico enviado" hint="Mensagens de contexto.">
                      <Input
                        type="number"
                        min={2}
                        max={60}
                        value={draft.historyLimit}
                        onChange={event => patch({ historyLimit: Number(event.target.value) || 20 })}
                      />
                    </Field>
                    <Field label="Máx. respostas/hora" hint="Por conversa.">
                      <Input
                        type="number"
                        min={1}
                        max={200}
                        value={draft.maxRepliesPerHour}
                        onChange={event => patch({ maxRepliesPerHour: Number(event.target.value) || 20 })}
                      />
                    </Field>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Criatividade (temperatura)" hint="0 = objetiva · 1 = criativa">
                      <Input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={draft.temperature}
                        onChange={event => patch({ temperature: Number(event.target.value) || 0 })}
                      />
                    </Field>
                    <Field label="Limite de tokens da resposta" hint="Respostas curtas: 300–600.">
                      <Input
                        type="number"
                        min={50}
                        max={4000}
                        step={50}
                        value={draft.maxTokens}
                        onChange={event => patch({ maxTokens: Number(event.target.value) || 500 })}
                      />
                    </Field>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-wa-line bg-[#f8faf9] px-3 py-2.5">
                    <div>
                      <p className="text-[12px] font-medium text-wa-ink">Responder em grupos</p>
                      <p className="text-[10.5px] text-wa-subtle">
                        Desativado por padrão. A IA só entra em conversas individuais.
                      </p>
                    </div>
                    <Switch
                      checked={draft.replyGroups}
                      onCheckedChange={checked => patch({ replyGroups: checked })}
                    />
                  </div>
                </Section>

                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    A IA pode cometer erros. Revise as informações da empresa e acompanhe as conversas.
                    Quando você responder manualmente, a IA pausa sozinha para você assumir o atendimento.
                  </p>
                </div>

                <Separator />

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-wa-ink">
                      <Sparkles className="size-3.5 text-wa-teal" />
                      Atividade recente da IA
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {logs.length} eventos
                    </Badge>
                  </div>
                  {logs.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-wa-line px-3 py-5 text-center text-[11px] text-wa-subtle">
                      Nada por aqui ainda. As respostas e erros da IA aparecem neste histórico.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {logs.slice(0, 12).map(log => {
                        const style = LOG_STYLES[log.kind];
                        return (
                          <div key={log.id} className="rounded-lg border border-wa-line bg-[#fbfcfc] px-2.5 py-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className={cn('px-1.5 py-0 text-[9px] font-semibold', style.className)}>
                                {style.label}
                              </Badge>
                              <span className="text-[10.5px] font-medium text-wa-ink">
                                {log.chatName ?? 'Sistema'}
                              </span>
                              <span className="ml-auto text-[9.5px] text-wa-subtle">{formatTime(log.at)}</span>
                            </div>
                            <p className="mt-1 text-[10.5px] leading-relaxed text-wa-subtle">{log.detail}</p>
                            {log.reply && (
                              <p className="mt-1 line-clamp-2 rounded bg-white px-2 py-1 text-[10.5px] text-wa-ink">
                                “{log.reply}”
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t bg-white px-4 py-3 sm:px-5">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button
                onClick={() => void handleSave()}
                disabled={saving}
                className="bg-wa-green text-white hover:bg-[#1fb457]"
              >
                {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Salvar ajustes
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="flex items-center justify-center py-16 text-sm text-wa-subtle">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Carregando ajustes...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

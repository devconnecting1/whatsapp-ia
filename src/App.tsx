import { useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { ChatView } from '@/components/ChatView';
import { QRDialog } from '@/components/QRDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Sidebar } from '@/components/Sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { cn } from '@/lib/utils';

export default function App() {
  const {
    status,
    settings,
    chats,
    activeChatId,
    messages,
    loadingChats,
    loadingMessages,
    sending,
    aiLogs,
    selectChat,
    sendText,
    sendMedia,
    setChatAi,
    saveSettings,
    testAi,
    connect,
    restart,
    logout,
  } = useWhatsApp();

  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return chats;
    return chats.filter(
      chat =>
        chat.name.toLowerCase().includes(query) ||
        chat.lastMessage.toLowerCase().includes(query),
    );
  }, [chats, search]);

  useEffect(() => {
    if (status?.state === 'qr') setQrOpen(true);
  }, [status?.state, status?.qrGeneratedAt]);

  useEffect(() => {
    if (activeChatId) setMobileChatOpen(true);
  }, [activeChatId]);

  async function handleConnect() {
    setQrOpen(true);
    try {
      await connect();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível conectar o WhatsApp.');
    }
  }

  async function handleLogout() {
    try {
      await logout();
      setMobileChatOpen(false);
      toast.success('WhatsApp desconectado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível desconectar.');
    }
  }

  function handleSidebarLogout() {
    if (!window.confirm('Desconectar esta conta do WhatsApp? Você precisará ler o QR Code novamente.')) {
      return;
    }
    void handleLogout();
  }

  async function handleToggleAi(enabled: boolean) {
    try {
      await setChatAi(enabled);
      if (enabled && !settings?.aiEnabled) {
        toast.info('A IA está desativada globalmente. Ative em Ajustes para começar a responder.');
      } else {
        toast.success(enabled ? 'IA ativada nesta conversa.' : 'IA desativada nesta conversa.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar a IA.');
    }
  }

  async function handleResume() {
    try {
      await setChatAi(true);
      toast.success('IA reativada nesta conversa.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível reativar a IA.');
    }
  }

  const showChatMobile = mobileChatOpen && Boolean(activeChat);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="h-dvh w-full overflow-hidden bg-[#d1d7db] md:p-3 lg:p-5">
        <div className="mx-auto flex h-full max-w-[1700px] overflow-hidden bg-white shadow-2xl md:rounded-xl md:border md:border-black/5">
          <div
            className={cn(
              'h-full w-full shrink-0 md:block md:w-[370px] lg:w-[410px]',
              showChatMobile ? 'hidden' : 'block',
            )}
          >
            <Sidebar
              status={status}
              chats={filteredChats}
              activeChatId={activeChatId}
              search={search}
              loading={loadingChats}
              onSearch={setSearch}
              onSelect={selectChat}
              onOpenSettings={() => setSettingsOpen(true)}
              onConnect={() => void handleConnect()}
              onLogout={handleSidebarLogout}
            />
          </div>

          <div className={cn('h-full min-w-0 flex-1 md:flex', showChatMobile ? 'flex' : 'hidden')}>
            <ChatView
              chat={activeChat}
              status={status}
              messages={messages}
              loading={loadingMessages}
              sending={sending}
              globalAiEnabled={settings?.aiEnabled ?? false}
              onSend={sendText}
              onSendMedia={sendMedia}
              onToggleAi={handleToggleAi}
              onResume={handleResume}
              onOpenSettings={() => setSettingsOpen(true)}
              onBack={() => setMobileChatOpen(false)}
              onConnect={() => void handleConnect()}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <QRDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        status={status}
        onRestart={restart}
        onLogout={logout}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        logs={aiLogs}
        onSave={saveSettings}
        onTest={testAi}
      />

      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          className: 'font-sans text-[13px]',
        }}
      />
    </TooltipProvider>
  );
}

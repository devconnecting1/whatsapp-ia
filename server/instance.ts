import { AiService } from './ai';
import { Store } from './store';
import { WhatsAppManager } from './whatsapp';

export const store = new Store();
export const manager = new WhatsAppManager(store);
export const ai = new AiService(store, manager);

manager.onInbound = chatId => ai.schedule(chatId);

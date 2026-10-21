const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const LONG_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatTime(timestamp: number): string {
  return TIME.format(new Date(timestamp));
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

export function formatChatTime(timestamp: number): string {
  if (!timestamp) return '';
  const now = Date.now();
  const date = new Date(timestamp);
  if (isSameDay(timestamp, now)) return TIME.format(date);
  if (isSameDay(timestamp, now - 24 * 60 * 60 * 1000)) return 'Ontem';
  if (now - timestamp < 6 * 24 * 60 * 60 * 1000) {
    return WEEKDAY.format(date).replace('.', '');
  }
  return SHORT_DATE.format(date);
}

export function formatDaySeparator(timestamp: number): string {
  const now = Date.now();
  if (isSameDay(timestamp, now)) return 'Hoje';
  if (isSameDay(timestamp, now - 24 * 60 * 60 * 1000)) return 'Ontem';
  return LONG_DATE.format(new Date(timestamp));
}

export function formatPhone(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return number.startsWith('+') ? number : `+${digits}`;
}

export function initials(name: string): string {
  const clean = name
    .replace(/^\+/, '')
    .replace(/@.*$/, '')
    .trim();
  if (!clean) return '?';
  if (/^[0-9\s()-]+$/.test(clean)) {
    const digits = clean.replace(/\D/g, '');
    return digits.slice(-2);
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

const AVATAR_COLORS = [
  'bg-[#0b6e63]',
  'bg-[#2f7d6d]',
  'bg-[#3b6e8f]',
  'bg-[#6b5b95]',
  'bg-[#9a5b62]',
  'bg-[#8a6d3b]',
  'bg-[#4d7c5f]',
  'bg-[#5b6b8c]',
];

export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100000;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

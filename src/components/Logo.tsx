import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  iconClassName?: string;
  showWordmark?: boolean;
  subtitle?: string;
}

export function Logo({ className, iconClassName, showWordmark = true, subtitle }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-2xl bg-wa-green text-white shadow-sm',
          iconClassName,
        )}
      >
        <MessageCircle className="size-5" strokeWidth={2.2} />
      </div>
      {showWordmark && (
        <div className="leading-tight">
          <p className="text-[17px] font-semibold tracking-tight">WhatsAI</p>
          {subtitle && <p className="text-[11px] opacity-75">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}

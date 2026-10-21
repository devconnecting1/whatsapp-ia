import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { avatarColor, initials } from '@/lib/format';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  name: string;
  id: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'size-8 text-[11px]',
  md: 'size-11 text-sm',
  lg: 'size-14 text-lg',
};

export function UserAvatar({ name, id, size = 'md', className }: UserAvatarProps) {
  return (
    <Avatar className={cn(SIZES[size], 'shrink-0', className)}>
      <AvatarFallback className={cn('font-semibold text-white', avatarColor(id))}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

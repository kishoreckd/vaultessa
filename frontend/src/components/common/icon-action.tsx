import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Icon-only button with a tooltip; `label` is also its accessible name. */
export function IconAction({
  label,
  children,
  size = 'icon-sm',
  variant = 'ghost',
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={variant} size={size} aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

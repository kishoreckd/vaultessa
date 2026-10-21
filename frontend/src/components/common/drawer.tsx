import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const WIDTH = {
  md: 'data-[side=right]:sm:max-w-md',
  lg: 'data-[side=right]:sm:max-w-lg',
  xl: 'data-[side=right]:sm:max-w-xl',
};

/**
 * Right-side drawer for create/edit/share tasks: fixed header, scrolling body, sticky footer.
 * Put the primary action in `footer` (use `form="<id>"` on submit buttons).
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = 'lg',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof WIDTH;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn('gap-0 p-0 data-[side=right]:w-full', WIDTH[size])}>
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <SheetFooter className="flex-row justify-end border-t bg-muted/30">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

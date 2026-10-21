import { create } from 'zustand';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
};
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const useConfirmStore = create<{ pending: Pending | null; set: (p: Pending | null) => void }>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
}));

/** Promise-based confirmation: `if (await confirmAction({...})) doIt()`. Name exactly what will happen. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...options, resolve }));
}

/** Mount once near the root. */
export function ConfirmDialogHost() {
  const { pending, set } = useConfirmStore();
  const close = (ok: boolean) => {
    pending?.resolve(ok);
    set(null);
  };

  return (
    <AlertDialog open={!!pending} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={pending?.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>
            {pending?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

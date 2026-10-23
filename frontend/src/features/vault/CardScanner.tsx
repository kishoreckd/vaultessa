import { useEffect, useId, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { TextField } from '@/components/common/form-field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { validCardNumber, type ScannedCard } from './cardOcrParser';

export function CardScanner({ onApply }: { onApply: (card: ScannedCard) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [card, setCard] = useState<ScannedCard | null>(null);
  const controller = useRef<AbortController | null>(null);
  const id = useId();
  useEffect(() => () => controller.current?.abort(), []);
  function close() {
    controller.current?.abort(); controller.current = null;
    setOpen(false); setCard(null); setError(''); setBusy(false);
  }
  async function scan(file?: File) {
    if (!file) return;
    setError(''); setCard(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('Choose a JPG, PNG or WebP image smaller than 10 MB.'); return;
    }
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy(true); setProgress(0);
    try {
      const { scanCard } = await import('./cardOcr');
      const result = await scanCard(file, current.signal, setProgress);
      if (!current.signal.aborted) {
        if (!Object.values(result).some(Boolean)) setError('No card details found. Try a clearer photo or enter the details manually.');
        else setCard(result);
      }
    } catch {
      if (!current.signal.aborted) setError('Could not scan this image. Try another image or enter the details manually.');
    } finally { if (!current.signal.aborted) setBusy(false); }
  }
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><ScanLine />Scan card</Button>
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Scan payment card</DialogTitle><DialogDescription>
          Choose a clear photo of the front of your card. Scanning happens on this device; the image is never uploaded or saved.
        </DialogDescription></DialogHeader>
        <div className="grid gap-2"><label htmlFor={id}>Card photo</label>
          <Input id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
            onChange={event => { void scan(event.target.files?.[0]); event.target.value = ''; }} />
          <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 10 MB. On mobile, your image picker may offer the camera.</p>
        </div>
        {busy && <div role="status" className="grid gap-2"><span>Scanning on this device… {progress}%</span><Progress aria-label="Card scanning progress" max={100} value={progress} /></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {card && <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">Review every field. Scanning can make mistakes. Applying details replaces only the non-empty fields below; save the item separately.</p>
          <TextField label="Card number" value={card.number} autoComplete="off" inputMode="numeric"
            onChange={e => setCard({ ...card, number: e.target.value })} />
          {card.number && !validCardNumber(card.number) && <p role="status" className="text-sm text-destructive">This number does not pass the card checksum. Check it against your card.</p>}
          <TextField label="Name on card" value={card.cardholder} autoComplete="off" onChange={e => setCard({ ...card, cardholder: e.target.value })} />
          <TextField label="Expiry" placeholder="MM/YY" value={card.expiry} autoComplete="off" onChange={e => setCard({ ...card, expiry: e.target.value })} />
        </div>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>{busy ? 'Cancel scan' : 'Back to manual entry'}</Button>
          {card && <Button type="button" disabled={!Object.values(card).some(value => value.trim())} onClick={() => { onApply(card); close(); }}>Apply reviewed details</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useClipboard } from '@/hooks/useClipboard';

export function RecoveryKeyCard({ recoveryKey }: { recoveryKey: string }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);
  const copy = useClipboard();
  useEffect(() => {
    let active = true;
    setImage('');
    setError(false);
    void QRCode.toDataURL(recoveryKey, { width: 320, margin: 4, errorCorrectionLevel: 'M' })
      .then((url) => { if (active) setImage(url); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [recoveryKey]);

  async function download() {
    try {
      const qr = new Image();
      qr.src = image;
      await qr.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#282044';
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('Vaultessa recovery key', 450, 60);
      ctx.drawImage(qr, 290, 85, 320, 320);
      ctx.font = '20px monospace';
      const lines = recoveryKey.match(/.{1,40}/g) ?? [];
      lines.forEach((line, i) => ctx.fillText(line, 450, 450 + i * 32));
      ctx.font = '18px sans-serif';
      ctx.fillText('Keep this image private and outside your vault.', 450, 590);
      ctx.fillText('Recovery also requires access to your verified email.', 450, 625);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Image unavailable')), 'image/png'));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'vaultessa-recovery-key.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Recovery image downloaded');
    } catch { toast.error('Could not download the image. Copy your key instead.'); }
  }

  return <div className="grid gap-4">
    {image && <img src={image} alt="QR code containing your private vault recovery key" className="mx-auto w-56 rounded-xl bg-white" />}
    {error && <p role="alert" className="text-sm text-destructive">QR image unavailable. You can still copy and save your key below.</p>}
    <code className="break-all rounded-lg border bg-muted/40 p-4 text-sm select-all">{recoveryKey}</code>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => void copy(recoveryKey, 'Recovery key')}>Copy key</Button>
      <Button disabled={!image} onClick={() => void download()}>Download recovery image</Button>
    </div>
    <p className="text-xs text-muted-foreground">The QR contains your recovery key. Store it privately outside Vaultessa. It is generated on this device and is not emailed or uploaded.</p>
    <p className="text-xs font-medium text-warning">This is not an authenticator QR — don’t scan it into Google Authenticator. To set up two-step verification, use Settings → Account security.</p>
  </div>;
}

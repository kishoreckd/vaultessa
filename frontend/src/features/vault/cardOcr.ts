import { parseCardText } from './cardOcrParser';

function cancellable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

export async function scanCard(file: File, signal: AbortSignal, progress: (value: number) => void) {
  const { createWorker } = await import('tesseract.js');
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const pending = createWorker('eng', 1, {
    workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr',
    workerBlobURL: false,
    errorHandler: () => {}, // Errors are reported in the scanner, never with image/text payloads.
    logger: event => {
      if (!signal.aborted) progress(event.status === 'recognizing text' ? 20 + Math.round(event.progress * 80) : Math.round(event.progress * 19));
    },
  });
  void pending.then(worker => { if (signal.aborted) void worker.terminate(); }, () => {});
  const worker = await cancellable(pending, signal);
  const cancel = () => { void worker.terminate(); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const result = await cancellable(worker.recognize(file), signal);
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return parseCardText(result.data.text);
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!signal.aborted) await worker.terminate();
    else cancel();
  }
}

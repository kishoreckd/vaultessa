import { expect, it, vi } from 'vitest';
import { scanCard } from '../src/features/vault/cardOcr';
const mocks = vi.hoisted(() => ({ createWorker: vi.fn() }));
vi.mock('tesseract.js', () => ({ createWorker: mocks.createWorker }));

it('uses same-origin OCR assets, parses locally and terminates the worker', async () => {
  const terminate = vi.fn().mockResolvedValue(undefined);
  const recognize = vi.fn().mockResolvedValue({ data: { text: '4111 1111 1111 1111\n09/29\nJANE DOE' } });
  mocks.createWorker.mockResolvedValue({ recognize, terminate });
  const file = {} as File;
  expect(await scanCard(file, new AbortController().signal, () => {})).toEqual({ number: '4111111111111111', expiry: '09/29', cardholder: 'JANE DOE' });
  expect(mocks.createWorker).toHaveBeenCalledWith('eng', 1, expect.objectContaining({ workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', workerBlobURL: false }));
  expect(recognize).toHaveBeenCalledWith(file);
  expect(terminate).toHaveBeenCalled();
});

it('terminates recognition and rejects when the dialog cancels', async () => {
  const controller = new AbortController();
  const terminate = vi.fn().mockResolvedValue(undefined);
  const recognize = vi.fn(() => { controller.abort(); return new Promise(() => {}); });
  mocks.createWorker.mockResolvedValue({ recognize, terminate });
  await expect(scanCard({} as File, controller.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' });
  expect(terminate).toHaveBeenCalled();
});

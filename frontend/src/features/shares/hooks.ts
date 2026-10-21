import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { externalSharesApi } from '@/lib/api/endpoints';
import type { ExternalShare } from '@/lib/api/types';
import { decryptJson, encryptJson, sealSend } from '@/lib/crypto';
import { requireKeys } from '@/stores/session';
import { getField, TEMPLATES } from '../vault/secretTemplates';
import type { DecryptedItem } from '../vault/vaultTypes';

export const linkKeys = {
  all: ['external-shares'] as const,
  forItem: (secretId: string) => ['external-shares', secretId] as const,
  config: ['external-shares', 'config'] as const,
};

/** What a share link contains: a label-based snapshot, so the guest page needs no templates. */
export type SharedSnapshot = {
  v: 1;
  name: string;
  typeLabel: string;
  sharedBy: string;
  message?: string;
  fields: Array<{ label: string; value: string; secret?: boolean; mono?: boolean; multiline?: boolean }>;
};

/** Stored encrypted under the owner's vault key so only they can re-copy or re-open the link. */
export type OwnerLinkSecret = { linkKey: string; accessCode?: string; fieldKeys: string[]; message?: string };

export type LinkTiming = { expiresAt: Date; maxViews: number | null };

/** Fields of an item that can go into a link, with current values. `notes` is included as a field. */
export function shareableFields(item: DecryptedItem) {
  const template = TEMPLATES[item.type];
  const list = template.fields
    .map((f) => ({ key: f.key, label: f.label, secret: f.secret, mono: f.mono, multiline: f.multiline, value: getField(item.data, f.key) }))
    .filter((f): f is typeof f & { value: string } => !!f.value);
  if (item.data.notes) list.push({ key: 'notes', label: template.notesLabel, secret: undefined, mono: undefined, multiline: true, value: item.data.notes });
  return list;
}

export function buildSnapshot(item: DecryptedItem, fieldKeys: string[], sharedBy: string, message?: string): SharedSnapshot {
  return {
    v: 1,
    name: item.data.name,
    typeLabel: TEMPLATES[item.type].label,
    sharedBy,
    message: message || undefined,
    fields: shareableFields(item)
      .filter((f) => fieldKeys.includes(f.key))
      .map(({ label, value, secret, mono, multiline }) => ({ label, value, secret, mono, multiline })),
  };
}

export function buildLink(id: string, linkKey: string) {
  return `${window.location.origin}/s/${id}#${linkKey}`;
}

export function readOwnerSecret(link: ExternalShare): Promise<OwnerLinkSecret> {
  if (!link.ownerKey) throw new Error('This link was created before links could be re-opened.');
  return decryptJson<OwnerLinkSecret>(requireKeys().vaultKey, link.ownerKey);
}

export function useShareConfig() {
  return useQuery({ queryKey: linkKeys.config, queryFn: externalSharesApi.config, staleTime: Infinity });
}

export function useExternalShares(secretId?: string) {
  return useQuery({
    queryKey: secretId ? linkKeys.forItem(secretId) : linkKeys.all,
    queryFn: () => externalSharesApi.list(secretId),
  });
}

export function useCreateShareLink() {
  const qc = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Couldn't create the link" },
    mutationFn: async (input: {
      item: DecryptedItem;
      fieldKeys: string[];
      sharedBy: string;
      message?: string;
      timing: LinkTiming;
      accessCode?: string;
      recipientEmail?: string;
    }) => {
      const snapshot = buildSnapshot(input.item, input.fieldKeys, input.sharedBy, input.message);
      const sealed = await sealSend(snapshot, input.accessCode);
      const owner: OwnerLinkSecret = {
        linkKey: sealed.linkKey,
        accessCode: input.accessCode,
        fieldKeys: input.fieldKeys,
        message: input.message,
      };
      const share = await externalSharesApi.create({
        secretId: input.item.id,
        encryptedData: sealed.encryptedData,
        expiresAt: input.timing.expiresAt.toISOString(),
        maxViews: input.timing.maxViews,
        codeSalt: sealed.codeSalt,
        codeVerifier: sealed.codeVerifier,
        recipientEmail: input.recipientEmail || undefined,
        ownerKey: await encryptJson(requireKeys().vaultKey, owner),
      });
      return { share, link: buildLink(share.id, sealed.linkKey) };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: linkKeys.all }),
  });
}

/** Re-activates the same URL with the item's CURRENT values (e.g. after the password changed). */
export function useReopenShareLink() {
  const qc = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Couldn't re-open the link" },
    mutationFn: async (input: { link: ExternalShare; item: DecryptedItem; sharedBy: string; timing: LinkTiming }) => {
      const owner = await readOwnerSecret(input.link);
      const snapshot = buildSnapshot(input.item, owner.fieldKeys, input.sharedBy, owner.message);
      const sealed = await sealSend(snapshot, owner.accessCode, owner.linkKey);
      const share = await externalSharesApi.reopen(input.link.id, {
        encryptedData: sealed.encryptedData,
        expiresAt: input.timing.expiresAt.toISOString(),
        maxViews: input.timing.maxViews,
        codeSalt: sealed.codeSalt,
        codeVerifier: sealed.codeVerifier,
      });
      return { share, link: buildLink(share.id, owner.linkKey), accessCode: owner.accessCode };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: linkKeys.all }),
  });
}

export function useEmailShareLink() {
  return useMutation({
    meta: { errorTitle: "Couldn't send the email" },
    mutationFn: ({ id, link }: { id: string; link: string }) => externalSharesApi.email(id, link),
  });
}

export function useRevokeShareLink() {
  const qc = useQueryClient();
  return useMutation({
    meta: { errorTitle: "Couldn't revoke the link" },
    mutationFn: (id: string) => externalSharesApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: linkKeys.all }),
  });
}

export const STATUS_LABEL = {
  active: 'Active',
  expired: 'Expired',
  used: 'Used up',
  revoked: 'Revoked',
  locked: 'Locked',
} as const;

export function emailDomain(email?: string | null) {
  return email && email.includes('@') ? email.split('@').pop()!.toLowerCase() : null;
}

export const DURATIONS = [
  { value: '1h', label: '1 hour', ms: 3_600_000 },
  { value: '24h', label: '24 hours', ms: 86_400_000 },
  { value: '7d', label: '7 days', ms: 7 * 86_400_000 },
  { value: '30d', label: '30 days', ms: 30 * 86_400_000 },
] as const;
export type DurationValue = (typeof DURATIONS)[number]['value'];

export const VIEW_LIMITS = ['unlimited', '3', '5', '10'] as const;
export type ViewLimit = (typeof VIEW_LIMITS)[number];
export type LinkMode = 'once' | 'period';

export function timingFor(mode: LinkMode, duration: DurationValue, viewLimit: ViewLimit): LinkTiming {
  return {
    expiresAt: new Date(Date.now() + DURATIONS.find((d) => d.value === duration)!.ms),
    maxViews: mode === 'once' ? 1 : viewLimit === 'unlimited' ? null : Number(viewLimit),
  };
}

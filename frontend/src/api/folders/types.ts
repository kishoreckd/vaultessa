export type Folder = {
  id: string;
  encryptedName: string;
  nameFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
  wrappedKey: string | null;
  sharedName: string | null;
  isOwner: boolean;
  permission: 'VIEW' | 'MODIFY' | 'MANAGE';
  memberCount: number;
  expiresAt: string | null;
};

export type FolderMember = {
  userId: string;
  name: string;
  email: string;
  permission: 'VIEW' | 'MODIFY';
  expiresAt: string | null;
  active: boolean;
};

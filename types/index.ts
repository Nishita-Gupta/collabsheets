export interface User {
  uid: string;
  displayName: string;
  email: string;
  color: string;
  photoURL?: string;
}

export interface CellData {
  value: string;
  formula?: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface Sheet {
  id: string;
  title: string;
  cells: Record<string, CellData>;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
  ownerName: string;
}

export interface PresenceUser {
  uid: string;
  displayName: string;
  color: string;
  selectedCell: string | null;
  lastSeen: number;
}
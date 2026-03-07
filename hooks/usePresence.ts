import { useEffect, useState } from "react";
import { ref, onValue, set, remove, onDisconnect } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { PresenceUser } from "@/types";

export function usePresence(docId: string, user: { uid: string; displayName: string; color: string } | null) {
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!docId || !user) return;

    const presenceRef = ref(rtdb, `presence/${docId}/${user.uid}`);
    const allPresenceRef = ref(rtdb, `presence/${docId}`);

    // Set user as present
    const userData: PresenceUser = {
      uid: user.uid,
      displayName: user.displayName,
      color: user.color,
      selectedCell: null,
      lastSeen: Date.now(),
    };

    set(presenceRef, userData);

    // Remove on disconnect
    onDisconnect(presenceRef).remove();

    // Listen to all users in this doc
    const unsub = onValue(allPresenceRef, (snap) => {
      const data = snap.val();
      if (!data) { setPresentUsers([]); return; }
      const users = Object.values(data) as PresenceUser[];
      setPresentUsers(users);
    });

    return () => {
      unsub();
      remove(presenceRef);
    };
  }, [docId, user]);

  const updateSelectedCell = (cellId: string) => {
    if (!docId || !user) return;
    const presenceRef = ref(rtdb, `presence/${docId}/${user.uid}`);
    set(presenceRef, {
      uid: user.uid,
      displayName: user.displayName,
      color: user.color,
      selectedCell: cellId,
      lastSeen: Date.now(),
    });
  };

  return { presentUsers, updateSelectedCell };
}
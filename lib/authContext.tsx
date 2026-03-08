"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";
import { User } from "@/types";

function generateColor(uid: string): string {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
    "#BB8FCE", "#85C1E9", "#82E0AA", "#F8C471",
  ];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  setUserColor: (color: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const savedName = typeof window !== "undefined" ? localStorage.getItem("guestDisplayName") : null;
        setUser({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || savedName || "Anonymous",
          email: firebaseUser.email || "",
          color: generateColor(firebaseUser.uid),
          photoURL: firebaseUser.photoURL || undefined,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const setDisplayName = async (name: string) => {
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: name });
      setUser((prev) => prev ? { ...prev, displayName: name } : null);
    }
  };

  const setUserColor = (color: string) => {
    setUser((prev) => prev ? { ...prev, color } : null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut, setDisplayName, setUserColor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
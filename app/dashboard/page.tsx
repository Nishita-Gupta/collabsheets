"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, getDocs,
  query, where, orderBy, serverTimestamp
} from "firebase/firestore";
import { Sheet } from "@/types";

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) fetchSheets();
  }, [user]);

  const fetchSheets = async () => {
    try {
      setLoadingSheets(true);
      const q = query(
        collection(db, "sheets"),
        where("ownerId", "==", user!.uid),
        orderBy("updatedAt", "desc")
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Sheet[];
      setSheets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSheets(false);
    }
  };

  const createSheet = async () => {
    if (!user) return;
    try {
      setIsCreating(true);
      const docRef = await addDoc(collection(db, "sheets"), {
        title: "Untitled Spreadsheet",
        cells: {},
        ownerId: user.uid,
        ownerName: user.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/doc/${docRef.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "Just now";
    // Handle Firestore Timestamp object
    if (timestamp?.toMillis) return new Date(timestamp.toMillis()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    // Handle seconds-based timestamp
    if (timestamp?.seconds) return new Date(timestamp.seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    // Handle regular number
    return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f0f1a" }}>
        <div style={{ width: "40px", height: "40px", border: "3px solid #667eea", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "white" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px", background: "rgba(255,255,255,0.02)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" fill="none" stroke="white" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M10 3v18M14 3v18" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "18px" }}>CollabSheet</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: user?.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600 }}>
              {user?.displayName?.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)" }}>{user?.displayName}</span>
          </div>
          <button
            onClick={signOut}
            style={{ padding: "6px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: "13px" }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 700 }}>My Spreadsheets</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", marginTop: "4px", fontSize: "14px" }}>
              {sheets.length} document{sheets.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={createSheet}
            disabled={isCreating}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", fontWeight: 600, cursor: "pointer", fontSize: "14px", opacity: isCreating ? 0.7 : 1 }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {isCreating ? "Creating..." : "New Spreadsheet"}
          </button>
        </div>

        {/* Sheets Grid */}
        {loadingSheets ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "rgba(255,255,255,0.3)" }}>
            Loading your spreadsheets...
          </div>
        ) : sheets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>No spreadsheets yet</h3>
            <p style={{ color: "rgba(255,255,255,0.4)", marginBottom: "24px" }}>Create your first spreadsheet to get started</p>
            <button
              onClick={createSheet}
              style={{ padding: "10px 24px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", fontWeight: 600, cursor: "pointer" }}>
              Create Spreadsheet
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
            {sheets.map((sheet) => (
              <div
                key={sheet.id}
                onClick={() => router.push(`/doc/${sheet.id}`)}
                style={{ padding: "20px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", cursor: "pointer", transition: "all 0.2s" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.07)";
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(102,126,234,0.4)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
                }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                  <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M10 3v18M14 3v18" />
                  </svg>
                </div>
                <h3 style={{ fontWeight: 600, fontSize: "15px", marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sheet.title}</h3>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
                  Modified {formatDate(sheet.updatedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
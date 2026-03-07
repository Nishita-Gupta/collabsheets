"use client";

import { useEffect, useState, useCallback, useRef, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { CellData } from "@/types";
import { evaluateFormula } from "@/lib/formulaParser";
import { usePresence } from "@/hooks/usePresence";

const ROWS = 100;
const COLS = 26;
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 25;

function getCellId(row: number, col: number) {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}
function getColLetter(col: number) {
  return String.fromCharCode(65 + col);
}
function parseCell(cellId: string) {
  const col = cellId.charCodeAt(0) - 65;
  const row = parseInt(cellId.slice(1)) - 1;
  return { row, col };
}

const Cell = memo(function Cell({
  isSelected, isEditing, displayValue, cell, editValue,
  onMouseDown, onDoubleClick, onEditChange, onEditBlur, onEditKeyDown, dark, presenceColor,
}: {
  isSelected: boolean; isEditing: boolean; displayValue: string;
  cell?: CellData; editValue: string; onMouseDown: () => void;
  onDoubleClick: () => void; onEditChange: (v: string) => void;
  onEditBlur: () => void; onEditKeyDown: (e: React.KeyboardEvent) => void;
  dark: boolean; presenceColor?: string;
}) {
  const bg = isSelected ? (dark ? "#1e3a5f" : "#e8f0fe") : (cell?.bgColor || (dark ? "#1e1e2e" : "white"));
  return (
    <td onMouseDown={onMouseDown} onDoubleClick={onDoubleClick}
      style={{
        height: `${DEFAULT_ROW_HEIGHT}px`, padding: 0,
        border: isSelected ? "2px solid #1a73e8" : presenceColor ? `2px solid ${presenceColor}` : `1px solid ${dark ? "#2a2a3e" : "#e0e0e0"}`,
        background: bg, cursor: "cell", overflow: "hidden",
        minWidth: `${DEFAULT_COL_WIDTH}px`, maxWidth: `${DEFAULT_COL_WIDTH}px`,
      }}>
      {isEditing ? (
        <input autoFocus value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditBlur} onKeyDown={onEditKeyDown}
          style={{ width: "100%", height: "100%", border: "none", outline: "none", padding: "0 4px", fontSize: "13px", background: dark ? "#2a2a4a" : "white", fontWeight: cell?.bold ? 700 : 400, fontStyle: cell?.italic ? "italic" : "normal", color: cell?.color || (dark ? "#e0e0e0" : "#000") }} />
      ) : (
        <span style={{ display: "block", padding: "0 4px", fontSize: "13px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", lineHeight: `${DEFAULT_ROW_HEIGHT}px`, fontWeight: cell?.bold ? 700 : 400, fontStyle: cell?.italic ? "italic" : "normal", color: cell?.color || (dark ? "#e0e0e0" : "#000"), userSelect: "none" }}>
          {displayValue}
        </span>
      )}
    </td>
  );
});

export default function DocPage() {
  const params = useParams();
  const id = params?.id as string;
  const { user, loading, setUserColor } = useAuth();
  const router = useRouter();

  const [cells, setCells] = useState<Record<string, CellData>>({});
  const [title, setTitle] = useState("Untitled Spreadsheet");
  const [editingTitle, setEditingTitle] = useState(false);
  const [selectedCell, setSelectedCell] = useState("A1");
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [colWidths, setColWidths] = useState<number[]>(Array(COLS).fill(DEFAULT_COL_WIDTH));
  const [rowHeights, setRowHeights] = useState<number[]>(Array(ROWS).fill(DEFAULT_ROW_HEIGHT));
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);
  const [lastModifiedBy, setLastModifiedBy] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const { presentUsers, updateSelectedCell } = usePresence(id, user);

  const cellsRef = useRef<Record<string, CellData>>({});
  const editValueRef = useRef("");
  const editingCellRef = useRef<string | null>(null);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizingCol = useRef<{ col: number; startX: number; startWidth: number } | null>(null);
  const resizingRow = useRef<{ row: number; startY: number; startHeight: number } | null>(null);

  editValueRef.current = editValue;
  editingCellRef.current = editingCell;
  cellsRef.current = cells;

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [loading, user, router]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "sheets", id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCells(data.cells || {});
        setTitle(data.title || "Untitled Spreadsheet");
        setLastModifiedBy(data.lastModifiedBy || "");
        setUpdatedAt(data.updatedAt?.toMillis?.() || Date.now());
        setReady(true);
      } else {
        router.push("/dashboard");
      }
    });
    return () => unsub();
  }, [id, router]);

  useEffect(() => {
    document.title = `${title} — CollabSheet`;
  }, [title]);

  const getCellValue = useCallback((cellId: string): string => {
    const cell = cellsRef.current[cellId];
    if (!cell) return "";
    if (cell.formula) return evaluateFormula(cell.formula, (cid) => cellsRef.current[cid]);
    return cell.value || "";
  }, []);

  const pushSave = useCallback((newCells: Record<string, CellData>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await updateDoc(doc(db, "sheets", id), {
          cells: newCells,
          updatedAt: serverTimestamp(),
          lastModifiedBy: user?.displayName || "Unknown",
        });
        setSaveStatus("saved");
      } catch (err) {
        console.error("Save error:", err);
        setSaveStatus("unsaved");
      }
    }, 600);
  }, [id, user]);

  const commitEdit = useCallback((cellId: string, value: string) => {
    const isFormula = value.startsWith("=");
    const prev = cellsRef.current[cellId] || {};
    const cellUpdate: CellData = { ...prev, value: isFormula ? "" : value };
    if (isFormula) cellUpdate.formula = value;
    else delete cellUpdate.formula;
    const newCells = { ...cellsRef.current, [cellId]: cellUpdate };
    setCells(newCells);
    pushSave(newCells);
  }, [pushSave]);

  const startEdit = useCallback((cellId: string, initial?: string) => {
    const cell = cellsRef.current[cellId];
    setEditingCell(cellId);
    setEditValue(initial ?? (cell?.formula || cell?.value || ""));
  }, []);

  const stopEdit = useCallback((shouldSave = true) => {
    const cellId = editingCellRef.current;
    const val = editValueRef.current;
    if (cellId && shouldSave) commitEdit(cellId, val);
    setEditingCell(null);
    setEditValue("");
    setTimeout(() => gridRef.current?.focus(), 10);
  }, [commitEdit]);

  const navigate = useCallback((dr: number, dc: number) => {
    setSelectedCell(prev => {
      const { row, col } = parseCell(prev);
      const newCell = getCellId(
        Math.max(0, Math.min(ROWS - 1, row + dr)),
        Math.max(0, Math.min(COLS - 1, col + dc))
      );
      updateSelectedCell(newCell);
      return newCell;
    });
  }, [updateSelectedCell]);

  const handleGridKey = useCallback((e: React.KeyboardEvent) => {
    if (editingCellRef.current) return;
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); navigate(-1, 0); break;
      case "ArrowDown": e.preventDefault(); navigate(1, 0); break;
      case "ArrowLeft": e.preventDefault(); navigate(0, -1); break;
      case "ArrowRight": e.preventDefault(); navigate(0, 1); break;
      case "Enter": e.preventDefault(); startEdit(selectedCell); break;
      case "Tab": e.preventDefault(); navigate(0, e.shiftKey ? -1 : 1); break;
      case "Delete":
      case "Backspace": e.preventDefault(); commitEdit(selectedCell, ""); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) startEdit(selectedCell, "");
    }
  }, [navigate, selectedCell, startEdit, commitEdit]);

  const handleCellKey = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); stopEdit(true); setTimeout(() => navigate(1, 0), 10); }
    else if (e.key === "Tab") { e.preventDefault(); stopEdit(true); setTimeout(() => navigate(0, e.shiftKey ? -1 : 1), 10); }
    else if (e.key === "Escape") { e.preventDefault(); stopEdit(false); }
    else if (e.key === "ArrowUp") { e.preventDefault(); stopEdit(true); setTimeout(() => navigate(-1, 0), 10); }
    else if (e.key === "ArrowDown") { e.preventDefault(); stopEdit(true); setTimeout(() => navigate(1, 0), 10); }
  }, [stopEdit, navigate]);

  const toggleFormat = useCallback((format: "bold" | "italic") => {
    const cell = cellsRef.current[selectedCell] || { value: "" };
    const newCells = { ...cellsRef.current, [selectedCell]: { ...cell, [format]: !cell[format] } };
    setCells(newCells);
    pushSave(newCells);
  }, [selectedCell, pushSave]);

  const setTextColor = useCallback((color: string) => {
    const cell = cellsRef.current[selectedCell] || { value: "" };
    const newCells = { ...cellsRef.current, [selectedCell]: { ...cell, color } };
    setCells(newCells);
    pushSave(newCells);
  }, [selectedCell, pushSave]);

  const setBgColor = useCallback((bgColor: string) => {
    const cell = cellsRef.current[selectedCell] || { value: "" };
    const newCells = { ...cellsRef.current, [selectedCell]: { ...cell, bgColor } };
    setCells(newCells);
    pushSave(newCells);
  }, [selectedCell, pushSave]);

  const exportCSV = useCallback(() => {
    const rows = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        const v = getCellValue(getCellId(r, c));
        return v.includes(",") ? `"${v}"` : v;
      }).join(",")
    ).filter(r => r.replace(/,/g, "").trim() !== "");
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title}.csv`;
    a.click();
  }, [getCellValue, title]);

  const startColResize = (e: React.MouseEvent, col: number) => {
    e.preventDefault();
    resizingCol.current = { col, startX: e.clientX, startWidth: colWidths[col] };
    const onMove = (me: MouseEvent) => {
      if (!resizingCol.current) return;
      const { col: c, startX, startWidth } = resizingCol.current;
      setColWidths(prev => {
        const n = [...prev];
        n[c] = Math.max(40, startWidth + me.clientX - startX);
        return n;
      });
    };
    const onUp = () => {
      resizingCol.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startRowResize = (e: React.MouseEvent, row: number) => {
    e.preventDefault();
    resizingRow.current = { row, startY: e.clientY, startHeight: rowHeights[row] };
    const onMove = (me: MouseEvent) => {
      if (!resizingRow.current) return;
      const { row: r, startY, startHeight } = resizingRow.current;
      setRowHeights(prev => {
        const n = [...prev];
        n[r] = Math.max(20, startHeight + me.clientY - startY);
        return n;
      });
    };
    const onUp = () => {
      resizingRow.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const saveTitle = async (val: string) => {
    setTitle(val);
    setEditingTitle(false);
    if (id) await updateDoc(doc(db, "sheets", id), { title: val });
  };

  const T = {
    appBg: dark ? "#0f0f1e" : "white",
    headerBg: dark ? "#12122a" : "white",
    toolbarBg: dark ? "#1a1a2e" : "#f8f9fa",
    border: dark ? "#2a2a3e" : "#e0e0e0",
    headerCellBg: dark ? "#1a1a2e" : "#f8f9fa",
    text: dark ? "#e0e0e0" : "#202124",
    subText: dark ? "#aaa" : "#5f6368",
  };

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.appBg }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "40px", height: "40px", border: "3px solid #1a73e8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <p style={{ color: T.subText, fontSize: "14px" }}>Loading spreadsheet...</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const selCell = cells[selectedCell];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: T.appBg, overflow: "hidden", fontFamily: "Arial, sans-serif" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", padding: "6px 12px", gap: "8px", borderBottom: `1px solid ${T.border}`, background: T.headerBg, flexShrink: 0 }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "6px", background: "linear-gradient(135deg, #0f9d58, #34a853)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M14 3v18" />
          </svg>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
          {editingTitle ? (
            <input autoFocus value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => saveTitle(title)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") saveTitle(title); }}
              style={{ fontSize: "16px", fontWeight: 500, border: "1px solid #1a73e8", borderRadius: "4px", padding: "2px 8px", outline: "none", background: T.appBg, color: T.text, width: "280px" }} />
          ) : (
            <span onClick={() => setEditingTitle(true)}
              style={{ fontSize: "16px", fontWeight: 500, cursor: "pointer", padding: "2px 8px", borderRadius: "4px", color: T.text }}
              onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "#2a2a3e" : "#f1f3f4")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              {title}
            </span>
          )}
          <button onClick={() => router.push("/dashboard")}
            style={{ fontSize: "12px", color: T.subText, background: "none", border: "none", cursor: "pointer", padding: "2px 8px", borderRadius: "4px" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "#2a2a3e" : "#f1f3f4")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            ← Dashboard
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginRight: "8px" }}>
          <span style={{ fontSize: "12px", color: saveStatus === "saved" ? "#0f9d58" : saveStatus === "saving" ? "#f4b400" : "#ea4335" }}>
            {saveStatus === "saved" ? "✓ Saved" : saveStatus === "saving" ? "Saving..." : "⚠ Unsaved"}
          </span>
          {lastModifiedBy && (
            <span style={{ fontSize: "10px", color: T.subText }}>
              Last edit by {lastModifiedBy} · {updatedAt ? new Date(updatedAt).toLocaleTimeString() : ""}
            </span>
          )}
        </div>

        {/* Online users */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginRight: "8px" }}>
          {presentUsers.map((u) => (
            <div key={u.uid}
              title={`${u.displayName} — ${u.selectedCell || "browsing"}`}
              style={{ width: "28px", height: "28px", borderRadius: "50%", background: u.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "white", border: "2px solid white", marginLeft: "-6px", cursor: "default", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>
              {u.displayName?.charAt(0).toUpperCase()}
            </div>
          ))}
          {presentUsers.length > 0 && (
            <span style={{ fontSize: "11px", color: T.subText, marginLeft: "6px" }}>
              {presentUsers.length} online
            </span>
          )}
        </div>

        <button onClick={() => setDark(d => !d)}
          style={{ width: "32px", height: "32px", borderRadius: "50%", border: `1px solid ${T.border}`, background: dark ? "#2a2a3e" : "#f1f3f4", cursor: "pointer", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {dark ? "☀️" : "🌙"}
        </button>

        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: user?.color || "#667eea", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "white" }}>
          {user?.displayName?.charAt(0).toUpperCase() || "?"}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "4px 8px", borderBottom: `1px solid ${T.border}`, background: T.toolbarBg, flexShrink: 0 }}>

        <button onClick={exportCSV}
          style={{ padding: "3px 10px", borderRadius: "4px", border: "none", background: "none", cursor: "pointer", fontSize: "12px", color: T.text }}
          onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "#2a2a3e" : "#e8eaed")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
          📥 Export CSV
        </button>

        <div style={{ width: "1px", height: "20px", background: T.border, margin: "0 2px" }} />

        {/* User color picker */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "2px 8px", borderRadius: "4px", background: dark ? "#2a2a3e" : "#f1f3f4" }}>
          <span style={{ fontSize: "11px", color: T.subText }}>You:</span>
          <div style={{ position: "relative", width: "20px", height: "20px", borderRadius: "50%", background: user?.color || "#667eea", cursor: "pointer", overflow: "hidden", border: "2px solid white", boxShadow: "0 0 0 1px #ccc" }}>
            <input type="color" value={user?.color || "#667eea"}
              onChange={(e) => setUserColor(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
              title="Change your color" />
          </div>
        </div>

        <div style={{ width: "1px", height: "20px", background: T.border, margin: "0 2px" }} />

        <button onClick={() => toggleFormat("bold")}
          style={{ width: "28px", height: "28px", borderRadius: "4px", border: "none", background: selCell?.bold ? "#e8f0fe" : "none", cursor: "pointer", fontWeight: 700, fontSize: "14px", color: T.text }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#e8eaed")}
          onMouseLeave={(e) => (e.currentTarget.style.background = selCell?.bold ? "#e8f0fe" : "none")}>
          B
        </button>

        <button onClick={() => toggleFormat("italic")}
          style={{ width: "28px", height: "28px", borderRadius: "4px", border: "none", background: selCell?.italic ? "#e8f0fe" : "none", cursor: "pointer", fontStyle: "italic", fontSize: "14px", color: T.text }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#e8eaed")}
          onMouseLeave={(e) => (e.currentTarget.style.background = selCell?.italic ? "#e8f0fe" : "none")}>
          I
        </button>

        <div style={{ width: "1px", height: "20px", background: T.border, margin: "0 2px" }} />

        {/* Text color */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", cursor: "pointer" }} title="Text color">
          <span style={{ fontSize: "12px", fontWeight: 700, color: selCell?.color || T.text, lineHeight: 1 }}>A</span>
          <div style={{ position: "relative", width: "22px", height: "4px", borderRadius: "2px", background: selCell?.color || "#000000" }}>
            <input type="color" value={selCell?.color || "#000000"}
              onChange={(e) => setTextColor(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
          </div>
        </div>

        {/* Fill color */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", cursor: "pointer", marginLeft: "4px" }} title="Fill color">
          <span style={{ fontSize: "12px", color: T.text, lineHeight: 1 }}>🪣</span>
          <div style={{ position: "relative", width: "22px", height: "4px", borderRadius: "2px", background: selCell?.bgColor || "#ffffff", border: "1px solid #ccc" }}>
            <input type="color" value={selCell?.bgColor || "#ffffff"}
              onChange={(e) => setBgColor(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
          </div>
        </div>

        <div style={{ width: "1px", height: "20px", background: T.border, margin: "0 4px" }} />

        <span style={{ fontSize: "12px", color: T.subText, minWidth: "32px", textAlign: "center", fontWeight: 600 }}>{selectedCell}</span>
        <span style={{ fontSize: "12px", color: T.subText, marginRight: "4px" }}>fx</span>
        <input
          value={editingCell === selectedCell ? editValue : (cells[selectedCell]?.formula || cells[selectedCell]?.value || "")}
          onChange={(e) => { if (editingCell !== selectedCell) startEdit(selectedCell, e.target.value); else setEditValue(e.target.value); }}
          onKeyDown={(e) => { e.stopPropagation(); handleCellKey(e); }}
          onBlur={() => stopEdit(true)}
          placeholder="Enter value or =SUM(A1:A5)"
          style={{ flex: 1, minWidth: "160px", border: `1px solid ${T.border}`, borderRadius: "4px", padding: "3px 8px", fontSize: "13px", outline: "none", color: T.text, background: T.appBg }}
        />
      </div>

      {/* Grid */}
      <div ref={gridRef} tabIndex={0} onKeyDown={handleGridKey}
        style={{ flex: 1, overflow: "auto", outline: "none" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: "46px", minWidth: "46px", height: "24px", background: T.headerCellBg, border: `1px solid ${T.border}`, position: "sticky", top: 0, left: 0, zIndex: 3 }} />
              {Array.from({ length: COLS }, (_, col) => (
                <th key={col} style={{ width: `${colWidths[col]}px`, minWidth: `${colWidths[col]}px`, height: "24px", background: T.headerCellBg, border: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 2, fontSize: "12px", color: T.subText, fontWeight: 500, userSelect: "none" }}>
                  <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {getColLetter(col)}
                    <div onMouseDown={(e) => startColResize(e, col)}
                      style={{ position: "absolute", right: 0, top: 0, width: "4px", height: "100%", cursor: "col-resize" }} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, row) => (
              <tr key={row}>
                <td onMouseDown={(e) => startRowResize(e, row)}
                  style={{ width: "46px", height: `${rowHeights[row]}px`, background: T.headerCellBg, border: `1px solid ${T.border}`, fontSize: "12px", color: T.subText, textAlign: "center", position: "sticky", left: 0, zIndex: 1, userSelect: "none", cursor: "row-resize" }}>
                  {row + 1}
                </td>
                {Array.from({ length: COLS }, (_, col) => {
                  const cellId = getCellId(row, col);
                  return (
                    <Cell key={cellId}
                      isSelected={selectedCell === cellId}
                      isEditing={editingCell === cellId}
                      displayValue={getCellValue(cellId)}
                      cell={cells[cellId]}
                      editValue={editValue}
                      dark={dark}
                      presenceColor={presentUsers.find(u => u.uid !== user?.uid && u.selectedCell === cellId)?.color}
                      onMouseDown={() => { if (editingCell) stopEdit(true); setSelectedCell(cellId); updateSelectedCell(cellId); gridRef.current?.focus(); }}
                      onDoubleClick={() => startEdit(cellId)}
                      onEditChange={setEditValue}
                      onEditBlur={() => stopEdit(true)}
                      onEditKeyDown={handleCellKey}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
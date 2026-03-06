"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { Sheet, CellData } from "@/types";
import { evaluateFormula } from "@/lib/formulaParser";

const ROWS = 100;
const COLS = 26;

function getCellId(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

function getColLetter(col: number): string {
  return String.fromCharCode(65 + col);
}

export default function DocPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [cells, setCells] = useState<Record<string, CellData>>({});
  const [selectedCell, setSelectedCell] = useState<string>("A1");
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [title, setTitle] = useState("Untitled Spreadsheet");
  const [editingTitle, setEditingTitle] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  // Real-time sync
  useEffect(() => {
    if (!id || !user) return;
    const unsub = onSnapshot(doc(db, "sheets", id), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Sheet;
        setSheet({ ...data, id: snap.id });
        setCells(data.cells || {});
        setTitle(data.title || "Untitled Spreadsheet");
      }
    });
    return () => unsub();
  }, [id, user]);

  const getCellValue = useCallback((cellId: string): string => {
    const cell = cells[cellId];
    if (!cell) return "";
    if (cell.formula) return evaluateFormula(cell.formula, (id) => cells[id]);
    return cell.value || "";
  }, [cells]);

  const saveCell = useCallback(async (cellId: string, value: string) => {
    if (!id) return;
    setSaveStatus("saving");
    const isFormula = value.startsWith("=");
    const newCells = {
      ...cells,
      [cellId]: {
        value: isFormula ? "" : value,
        formula: isFormula ? value : undefined,
        bold: cells[cellId]?.bold,
        italic: cells[cellId]?.italic,
        color: cells[cellId]?.color,
      }
    };
    setCells(newCells);
    try {
      await updateDoc(doc(db, "sheets", id), {
        cells: newCells,
        updatedAt: serverTimestamp(),
      });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }, [id, cells]);

  const handleCellClick = (cellId: string) => {
    if (editingCell && editingCell !== cellId) {
      saveCell(editingCell, editValue);
      setEditingCell(null);
    }
    setSelectedCell(cellId);
  };

  const handleCellDoubleClick = (cellId: string) => {
    setEditingCell(cellId);
    const cell = cells[cellId];
    setEditValue(cell?.formula || cell?.value || "");
  };

  const handleCellBlur = () => {
    if (editingCell) {
      saveCell(editingCell, editValue);
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, cellId: string) => {
    const [col, ...rowParts] = cellId.split("");
    const colIdx = col.charCodeAt(0) - 65;
    const rowIdx = parseInt(rowParts.join("")) - 1;

    if (e.key === "Enter") {
      saveCell(cellId, editValue);
      setEditingCell(null);
      const nextRow = Math.min(rowIdx + 1, ROWS - 1);
      setSelectedCell(getCellId(nextRow, colIdx));
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setEditValue("");
    } else if (e.key === "Tab") {
      e.preventDefault();
      saveCell(cellId, editValue);
      setEditingCell(null);
      const nextCol = Math.min(colIdx + 1, COLS - 1);
      setSelectedCell(getCellId(rowIdx, nextCol));
    }
  };

  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    if (editingCell) return;
    const col = selectedCell.charCodeAt(0) - 65;
    const row = parseInt(selectedCell.slice(1)) - 1;

    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedCell(getCellId(Math.max(row - 1, 0), col)); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSelectedCell(getCellId(Math.min(row + 1, ROWS - 1), col)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setSelectedCell(getCellId(row, Math.max(col - 1, 0))); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setSelectedCell(getCellId(row, Math.min(col + 1, COLS - 1))); }
    else if (e.key === "Enter" || e.key === "F2") {
      setEditingCell(selectedCell);
      const cell = cells[selectedCell];
      setEditValue(cell?.formula || cell?.value || "");
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      setEditingCell(selectedCell);
      setEditValue(" ");
    }
  };

  const saveTitle = async (newTitle: string) => {
    if (!id) return;
    setTitle(newTitle);
    setEditingTitle(false);
    await updateDoc(doc(db, "sheets", id), { title: newTitle });
  };

  const toggleFormat = async (format: "bold" | "italic") => {
    if (!selectedCell || !id) return;
    const cell = cells[selectedCell] || { value: "" };
    const newCells = {
      ...cells,
      [selectedCell]: { ...cell, [format]: !cell[format] }
    };
    setCells(newCells);
    await updateDoc(doc(db, "sheets", id), { cells: newCells });
  };

  if (loading || !sheet) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a2e" }}>
        <div style={{ width: "40px", height: "40px", border: "3px solid #667eea", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#1a1a2e", color: "white", overflow: "hidden" }}
      onKeyDown={handleGridKeyDown} tabIndex={0}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#12122a", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => router.push("/dashboard")}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => saveTitle(title)}
              onKeyDown={(e) => e.key === "Enter" && saveTitle(title)}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid #667eea", borderRadius: "6px", color: "white", padding: "4px 8px", fontSize: "15px", fontWeight: 600, outline: "none" }}
            />
          ) : (
            <span onClick={() => setEditingTitle(true)}
              style={{ fontSize: "15px", fontWeight: 600, cursor: "pointer", padding: "4px 8px", borderRadius: "6px" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              {title}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Save status */}
          <span style={{ fontSize: "12px", color: saveStatus === "saved" ? "#82E0AA" : saveStatus === "saving" ? "#F8C471" : "#FF6B6B" }}>
            {saveStatus === "saved" ? "✓ Saved" : saveStatus === "saving" ? "Saving..." : "⚠ Unsaved"}
          </span>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: user?.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600 }}>
            {user?.displayName?.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#12122a", flexShrink: 0 }}>
        <button onClick={() => toggleFormat("bold")}
          style={{ padding: "4px 10px", borderRadius: "6px", border: "none", background: cells[selectedCell]?.bold ? "rgba(102,126,234,0.4)" : "rgba(255,255,255,0.08)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}>
          B
        </button>
        <button onClick={() => toggleFormat("italic")}
          style={{ padding: "4px 10px", borderRadius: "6px", border: "none", background: cells[selectedCell]?.italic ? "rgba(102,126,234,0.4)" : "rgba(255,255,255,0.08)", color: "white", cursor: "pointer", fontStyle: "italic", fontSize: "14px" }}>
          I
        </button>
        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />
        {/* Formula bar */}
        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", marginRight: "4px" }}>{selectedCell}</span>
        <input
          value={editingCell === selectedCell ? editValue : (cells[selectedCell]?.formula || cells[selectedCell]?.value || "")}
          onChange={(e) => {
            if (editingCell === selectedCell) setEditValue(e.target.value);
            else { setEditingCell(selectedCell); setEditValue(e.target.value); }
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            handleKeyDown(e, selectedCell);
            }}
          onBlur={handleCellBlur}
          placeholder="Enter value or formula (e.g. =SUM(A1:A5))"
          style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "white", padding: "4px 10px", fontSize: "13px", outline: "none" }}
        />
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: "50px", minWidth: "50px", height: "28px", background: "#1e1e3a", borderRight: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)", position: "sticky", top: 0, left: 0, zIndex: 3 }} />
              {Array.from({ length: COLS }, (_, col) => (
                <th key={col} style={{ width: "100px", minWidth: "100px", height: "28px", background: "#1e1e3a", borderRight: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: 600, position: "sticky", top: 0, zIndex: 2, textAlign: "center" }}>
                  {getColLetter(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, row) => (
              <tr key={row}>
                <td style={{ width: "50px", height: "28px", background: "#1e1e3a", borderRight: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: "12px", color: "rgba(255,255,255,0.5)", textAlign: "center", position: "sticky", left: 0, zIndex: 1, fontWeight: 600 }}>
                  {row + 1}
                </td>
                {Array.from({ length: COLS }, (_, col) => {
                  const cellId = getCellId(row, col);
                  const isSelected = selectedCell === cellId;
                  const isEditing = editingCell === cellId;
                  const cell = cells[cellId];
                  const displayValue = getCellValue(cellId);

                  return (
                    <td key={col}
                      onClick={() => handleCellClick(cellId)}
                      onDoubleClick={() => handleCellDoubleClick(cellId)}
                      style={{
                        width: "100px", height: "28px", padding: "0",
                        border: isSelected ? "2px solid #667eea" : "1px solid rgba(255,255,255,0.06)",
                        background: isSelected ? "rgba(102,126,234,0.1)" : "transparent",
                        position: "relative", cursor: "cell",
                      }}>
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellBlur}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            handleKeyDown(e, cellId);
                            }}
                          style={{ width: "100%", height: "100%", background: "#2a2a4a", border: "none", outline: "none", color: "white", padding: "0 4px", fontSize: "13px" }}
                        />
                      ) : (
                        <span style={{
                          display: "block", padding: "0 4px", fontSize: "13px", overflow: "hidden",
                          whiteSpace: "nowrap", textOverflow: "ellipsis", lineHeight: "28px",
                          fontWeight: cell?.bold ? 700 : 400,
                          fontStyle: cell?.italic ? "italic" : "normal",
                          color: cell?.color || "rgba(255,255,255,0.85)",
                        }}>
                          {displayValue}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
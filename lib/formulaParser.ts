import { CellData } from "@/types";

type CellGetter = (cellId: string) => CellData | undefined;

// Convert column letter to index (A=0, B=1, ...)
export function colLetterToIndex(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + col.charCodeAt(i) - 64;
  }
  return result - 1;
}

// Convert index to column letter (0=A, 1=B, ...)
export function indexToColLetter(index: number): string {
  let result = "";
  let i = index + 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    i = Math.floor((i - 1) / 26);
  }
  return result;
}

// Parse a cell ID like "A1" into { col: "A", row: 1 }
export function parseCellId(cellId: string): { col: string; row: number } | null {
  const match = cellId.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return { col: match[1], row: parseInt(match[2]) };
}

// Expand a range like "A1:A5" into ["A1", "A2", "A3", "A4", "A5"]
export function expandRange(range: string): string[] {
  const [start, end] = range.split(":");
  const startCell = parseCellId(start.trim());
  const endCell = parseCellId(end.trim());
  if (!startCell || !endCell) return [];

  const cells: string[] = [];
  const startColIdx = colLetterToIndex(startCell.col);
  const endColIdx = colLetterToIndex(endCell.col);

  for (let col = startColIdx; col <= endColIdx; col++) {
    for (let row = startCell.row; row <= endCell.row; row++) {
      cells.push(`${indexToColLetter(col)}${row}`);
    }
  }
  return cells;
}

// Get numeric value of a cell
function getCellNumericValue(cellId: string, getCellData: CellGetter): number {
  const cell = getCellData(cellId);
  if (!cell) return 0;
  const num = parseFloat(cell.value);
  return isNaN(num) ? 0 : num;
}

// Evaluate SUM
function evalSum(args: string, getCellData: CellGetter): number {
  const parts = args.split(",").map((s) => s.trim());
  let total = 0;
  for (const part of parts) {
    if (part.includes(":")) {
      expandRange(part).forEach((cellId) => {
        total += getCellNumericValue(cellId, getCellData);
      });
    } else if (/^[A-Z]+\d+$/.test(part)) {
      total += getCellNumericValue(part, getCellData);
    } else {
      total += parseFloat(part) || 0;
    }
  }
  return total;
}

// Evaluate AVERAGE
function evalAverage(args: string, getCellData: CellGetter): number {
  const parts = args.split(",").map((s) => s.trim());
  const values: number[] = [];
  for (const part of parts) {
    if (part.includes(":")) {
      expandRange(part).forEach((cellId) => {
        values.push(getCellNumericValue(cellId, getCellData));
      });
    } else if (/^[A-Z]+\d+$/.test(part)) {
      values.push(getCellNumericValue(part, getCellData));
    } else {
      values.push(parseFloat(part) || 0);
    }
  }
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

// Evaluate MAX
function evalMax(args: string, getCellData: CellGetter): number {
  const parts = args.split(",").map((s) => s.trim());
  const values: number[] = [];
  for (const part of parts) {
    if (part.includes(":")) {
      expandRange(part).forEach((cellId) => {
        values.push(getCellNumericValue(cellId, getCellData));
      });
    } else if (/^[A-Z]+\d+$/.test(part)) {
      values.push(getCellNumericValue(part, getCellData));
    } else {
      values.push(parseFloat(part) || 0);
    }
  }
  return values.length ? Math.max(...values) : 0;
}

// Evaluate MIN
function evalMin(args: string, getCellData: CellGetter): number {
  const parts = args.split(",").map((s) => s.trim());
  const values: number[] = [];
  for (const part of parts) {
    if (part.includes(":")) {
      expandRange(part).forEach((cellId) => {
        values.push(getCellNumericValue(cellId, getCellData));
      });
    } else if (/^[A-Z]+\d+$/.test(part)) {
      values.push(getCellNumericValue(part, getCellData));
    } else {
      values.push(parseFloat(part) || 0);
    }
  }
  return values.length ? Math.min(...values) : 0;
}

// Replace cell references in expression with their values
function replaceCellRefs(expr: string, getCellData: CellGetter): string {
  return expr.replace(/[A-Z]+\d+/g, (cellId) => {
    return String(getCellNumericValue(cellId, getCellData));
  });
}

// Main formula evaluator
export function evaluateFormula(formula: string, getCellData: CellGetter): string {
  try {
    if (!formula.startsWith("=")) return formula;

    const expr = formula.slice(1).trim().toUpperCase();

    // SUM
    const sumMatch = expr.match(/^SUM\((.+)\)$/);
    if (sumMatch) return String(evalSum(sumMatch[1], getCellData));

    // AVERAGE
    const avgMatch = expr.match(/^AVERAGE\((.+)\)$/);
    if (avgMatch) return String(evalAverage(avgMatch[1], getCellData));

    // MAX
    const maxMatch = expr.match(/^MAX\((.+)\)$/);
    if (maxMatch) return String(evalMax(maxMatch[1], getCellData));

    // MIN
    const minMatch = expr.match(/^MIN\((.+)\)$/);
    if (minMatch) return String(evalMin(minMatch[1], getCellData));

    // Basic arithmetic with cell references (e.g., =A1+B2*3)
    const arithmetic = replaceCellRefs(expr, getCellData);
    if (/^[\d\s\+\-\*\/\.\(\)]+$/.test(arithmetic)) {
      // eslint-disable-next-line no-eval
      const result = Function(`"use strict"; return (${arithmetic})`)();
      return String(result);
    }

    return "#ERROR";
  } catch {
    return "#ERROR";
  }
}
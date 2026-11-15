import type { E3Sheet } from './e3Types.ts';

export interface SheetFolderNode {
  path: string;
  name: string;
  depth: number;
  sheets: E3Sheet[];
  children: SheetFolderNode[];
  totalSheetCount: number;
}

export interface SheetTreeResult {
  folders: SheetFolderNode[];
  rootSheets: E3Sheet[];
  allFolderPaths: string[];
}

export function normalizeFolderPath(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .split(/[\\/]/)
    .map((seg) => seg.trim())
    .filter(Boolean)
    .join('/');
}

export function collectAllSheetFolderPaths(
  sheets: E3Sheet[],
  explicitFolders: string[] = []
): string[] {
  const pathSet = new Set<string>();

  const addWithParents = (rawPath: string | undefined) => {
    const norm = normalizeFolderPath(rawPath);
    if (!norm) return;
    const parts = norm.split('/');
    for (let i = 1; i <= parts.length; i++) {
      pathSet.add(parts.slice(0, i).join('/'));
    }
  };

  for (const f of explicitFolders) {
    addWithParents(f);
  }
  for (const s of sheets) {
    addWithParents(s.folder);
  }

  return Array.from(pathSet).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}

export function buildSheetTree(
  sheets: E3Sheet[],
  explicitFolders: string[] = []
): SheetTreeResult {
  const allFolderPaths = collectAllSheetFolderPaths(sheets, explicitFolders);
  const nodeMap = new Map<string, SheetFolderNode>();
  const topNodes: SheetFolderNode[] = [];

  for (const path of allFolderPaths) {
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    const depth = parts.length - 1;
    const node: SheetFolderNode = {
      path,
      name,
      depth,
      sheets: [],
      children: [],
      totalSheetCount: 0,
    };
    nodeMap.set(path, node);
    if (parts.length === 1) {
      topNodes.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = nodeMap.get(parentPath);
      if (parent) {
        parent.children.push(node);
      } else {
        topNodes.push(node);
      }
    }
  }

  const rootSheets: E3Sheet[] = [];
  for (const s of sheets) {
    const norm = normalizeFolderPath(s.folder);
    const targetNode = norm ? nodeMap.get(norm) : undefined;
    if (targetNode) {
      targetNode.sheets.push(s);
    } else {
      rootSheets.push(s);
    }
  }

  const computeCounts = (node: SheetFolderNode): number => {
    node.children.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
    let total = node.sheets.length;
    for (const child of node.children) {
      total += computeCounts(child);
    }
    node.totalSheetCount = total;
    return total;
  };

  topNodes.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
  for (const node of topNodes) {
    computeCounts(node);
  }

  return {
    folders: topNodes,
    rootSheets,
    allFolderPaths,
  };
}

export function createSheetFolderInProject(
  sheets: E3Sheet[],
  explicitFolders: string[] = [],
  folderPath: string
): { sheets: E3Sheet[]; sheetFolders: string[]; createdPath: string } {
  const createdPath = normalizeFolderPath(folderPath);
  if (!createdPath) {
    return {
      sheets,
      sheetFolders: collectAllSheetFolderPaths(sheets, explicitFolders),
      createdPath: '',
    };
  }
  const merged = collectAllSheetFolderPaths(sheets, [...explicitFolders, createdPath]);
  return {
    sheets,
    sheetFolders: merged,
    createdPath,
  };
}

export function renameSheetFolderInProject(
  sheets: E3Sheet[],
  explicitFolders: string[] = [],
  oldPathRaw: string,
  newNameOrPathRaw: string
): { sheets: E3Sheet[]; sheetFolders: string[]; nextPath: string } {
  const oldPath = normalizeFolderPath(oldPathRaw);
  const cleanedNew = normalizeFolderPath(newNameOrPathRaw);
  if (!oldPath || !cleanedNew) {
    return {
      sheets,
      sheetFolders: collectAllSheetFolderPaths(sheets, explicitFolders),
      nextPath: oldPath,
    };
  }

  // If user enters a single segment name without '/', keep the same parent prefix
  const oldParts = oldPath.split('/');
  const nextPath =
    cleanedNew.includes('/') || oldParts.length === 1
      ? cleanedNew
      : [...oldParts.slice(0, -1), cleanedNew].join('/');

  if (nextPath === oldPath) {
    return {
      sheets,
      sheetFolders: collectAllSheetFolderPaths(sheets, explicitFolders),
      nextPath,
    };
  }

  const rewritePath = (p: string | undefined): string | undefined => {
    const norm = normalizeFolderPath(p);
    if (!norm) return undefined;
    if (norm === oldPath) return nextPath;
    if (norm.startsWith(`${oldPath}/`)) {
      return `${nextPath}${norm.slice(oldPath.length)}`;
    }
    return norm;
  };

  const nextSheets = sheets.map((s) => {
    const updated = rewritePath(s.folder);
    return updated === normalizeFolderPath(s.folder)
      ? s
      : { ...s, folder: updated };
  });

  const nextExplicit = explicitFolders
    .map((f) => rewritePath(f) || '')
    .filter(Boolean);

  return {
    sheets: nextSheets,
    sheetFolders: collectAllSheetFolderPaths(nextSheets, nextExplicit),
    nextPath,
  };
}

export function deleteSheetFolderFromProject(
  sheets: E3Sheet[],
  explicitFolders: string[] = [],
  folderPathRaw: string
): { sheets: E3Sheet[]; sheetFolders: string[] } {
  const folderPath = normalizeFolderPath(folderPathRaw);
  if (!folderPath) {
    return {
      sheets,
      sheetFolders: collectAllSheetFolderPaths(sheets, explicitFolders),
    };
  }

  const parts = folderPath.split('/');
  const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;

  const isInside = (p: string | undefined): boolean => {
    const norm = normalizeFolderPath(p);
    return norm === folderPath || norm.startsWith(`${folderPath}/`);
  };

  const nextSheets = sheets.map((s) => {
    if (!isInside(s.folder)) return s;
    return {
      ...s,
      folder: parentPath,
    };
  });

  const remainingExplicit = collectAllSheetFolderPaths([], explicitFolders).filter(
    (f) => !isInside(f)
  );

  return {
    sheets: nextSheets,
    sheetFolders: collectAllSheetFolderPaths(nextSheets, remainingExplicit),
  };
}

export function moveSheetToFolderInProject(
  sheets: E3Sheet[],
  explicitFolders: string[] = [],
  sheetId: string,
  targetFolderRaw: string | undefined | null
): { sheets: E3Sheet[]; sheetFolders: string[] } {
  const targetFolder = normalizeFolderPath(targetFolderRaw);
  const nextSheets = sheets.map((s) =>
    s.id === sheetId
      ? { ...s, folder: targetFolder || undefined }
      : s
  );
  const baseExplicit = collectAllSheetFolderPaths([], explicitFolders);
  const nextExplicit = targetFolder
    ? collectAllSheetFolderPaths(nextSheets, [...baseExplicit, targetFolder])
    : collectAllSheetFolderPaths(nextSheets, baseExplicit);
  return {
    sheets: nextSheets,
    sheetFolders: nextExplicit,
  };
}

export function getAdjacentSheetId(
  sheets: E3Sheet[],
  activeSheetId: string,
  delta: -1 | 1
): string | null {
  if (sheets.length <= 1) return null;
  const idx = sheets.findIndex((s) => s.id === activeSheetId);
  if (idx === -1) return sheets[0]?.id || null;
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= sheets.length) return null;
  return sheets[nextIdx]?.id || null;
}

export function getSheetPositionInfo(
  sheets: E3Sheet[],
  activeSheetId: string
): { index: number; total: number; prevId: string | null; nextId: string | null } {
  const total = sheets.length;
  const idx = sheets.findIndex((s) => s.id === activeSheetId);
  if (idx === -1) {
    return {
      index: total > 0 ? 0 : -1,
      total,
      prevId: null,
      nextId: total > 1 ? sheets[1]?.id || null : null,
    };
  }
  return {
    index: idx,
    total,
    prevId: idx > 0 ? sheets[idx - 1].id : null,
    nextId: idx < total - 1 ? sheets[idx + 1].id : null,
  };
}

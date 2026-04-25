/**
 * Generates a Hamiltonian path on an N×N grid using Warnsdorff's heuristic,
 * then blanks out a ratio of interior nodes to produce the puzzle.
 *
 * Output LevelData:
 *   grid[row][col] = positive number  → visible node
 *   grid[row][col] = 0                → blanked node (shown as dashed circle)
 *   grid[row][col] = -1               → not used (only for non-square future expansion)
 */

export interface LevelData {
    size: number;           // grid dimension N
    grid: number[][];       // N×N, values 1..N² or 0 for blanked
    total: number;          // N²
    path: [number, number][]; // ordered [row,col] sequence of the Hamiltonian path
    blankRatio: number;
}

// 8-directional moves
const DIRS: [number, number][] = [
    [-1, -1], [-1, 0], [-1, 1],
    [ 0, -1],          [ 0, 1],
    [ 1, -1], [ 1, 0], [ 1, 1],
];

function inBounds(r: number, c: number, n: number) {
    return r >= 0 && r < n && c >= 0 && c < n;
}

/** Count accessible unvisited neighbours (Warnsdorff's heuristic key). */
function degree(r: number, c: number, visited: boolean[][], n: number): number {
    let cnt = 0;
    for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc, n) && !visited[nr][nc]) cnt++;
    }
    return cnt;
}

function seededRandom(seed: number) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
    };
}

/**
 * Try to build a Hamiltonian path from (startR, startC) using Warnsdorff + random tie-break.
 * Returns ordered path or null if failed.
 */
function tryHamiltonianPath(
    n: number,
    startR: number,
    startC: number,
    rand: () => number,
): [number, number][] | null {
    const visited: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
    const path: [number, number][] = [];

    let r = startR, c = startC;
    visited[r][c] = true;
    path.push([r, c]);

    for (let step = 1; step < n * n; step++) {
        const neighbours: { r: number; c: number; deg: number }[] = [];
        for (const [dr, dc] of DIRS) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc, n) && !visited[nr][nc]) {
                neighbours.push({ r: nr, c: nc, deg: degree(nr, nc, visited, n) });
            }
        }
        if (neighbours.length === 0) return null;

        // Sort by degree ascending, shuffle ties
        neighbours.sort((a, b) => {
            if (a.deg !== b.deg) return a.deg - b.deg;
            return rand() - 0.5;
        });

        const next = neighbours[0];
        visited[next.r][next.c] = true;
        path.push([next.r, next.c]);
        r = next.r;
        c = next.c;
    }
    return path;
}

export function generateLevel(level: number, seed?: number): LevelData {
    const n = level <= 1 ? 4 : level === 2 ? 6 : 8;
    const total = n * n;
    const blankRatio = level <= 1 ? 0
        : level === 2 ? 0.10
        : 0.20 + (level - 3) * (0.40 / 17);

    const rand = seededRandom(seed ?? (level * 31337 + Date.now()));

    // Attempt path generation with random starting positions
    let path: [number, number][] | null = null;
    const attempts = 200;
    for (let i = 0; i < attempts && !path; i++) {
        const sr = Math.floor(rand() * n);
        const sc = Math.floor(rand() * n);
        path = tryHamiltonianPath(n, sr, sc, rand);
    }

    if (!path) {
        // Deterministic fallback: snake pattern
        path = [];
        for (let r = 0; r < n; r++) {
            if (r % 2 === 0) {
                for (let c = 0; c < n; c++) path.push([r, c]);
            } else {
                for (let c = n - 1; c >= 0; c--) path.push([r, c]);
            }
        }
    }

    // Assign sequential numbers along path
    const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < path.length; i++) {
        const [r, c] = path[i];
        grid[r][c] = i + 1;
    }

    // Blank interior nodes
    const blankCount = Math.floor(total * blankRatio);
    const candidates: number[] = [];
    for (let i = 1; i < path.length - 1; i++) candidates.push(i); // skip index 0 (val=1) and last

    // Fisher-Yates shuffle then take first blankCount
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let k = 0; k < blankCount; k++) {
        const [r, c] = path[candidates[k]];
        grid[r][c] = 0;
    }

    return { size: n, grid, total, path, blankRatio };
}

/** Validate that a path is a valid Hamiltonian path (all cells 8-adjacent in sequence). */
export function validatePath(path: [number, number][]): boolean {
    for (let i = 1; i < path.length; i++) {
        const dr = Math.abs(path[i][0] - path[i - 1][0]);
        const dc = Math.abs(path[i][1] - path[i - 1][1]);
        if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) return false;
    }
    return true;
}

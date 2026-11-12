// Pure maze algorithm ("origin shift"): no DOM, no audio, no clocks, no global randomness.
// Every cell points at a neighbour; following the pointers from any cell leads to the
// origin, whose direction is (0, 0). A wall between two cells is open exactly when one
// of them points at the other. shift() moves the origin one step to a random in-bounds
// neighbour: the old origin points at the new one, the new origin's pointer is cleared,
// and all walls are recomputed. Outer walls always stay closed.

import type { Rng } from './rng';

export class Cell {
    walls: boolean[];
    direction: { x: number, y: number } | null;
    visited: boolean;

    constructor() {
        this.walls = [true, true, true, true]; // top, right, bottom, left
        this.direction = null; // { x, y } or null
        this.visited = false;
    }

    setDirection(x: number, y: number) {
        this.direction = { x, y };
    }
}

const DIRECTIONS = [
    { x: 0, y: -1 }, // up
    { x: 1, y: 0 },  // right
    { x: 0, y: 1 },  // down
    { x: -1, y: 0 }  // left
];

export class Maze {
    width: number;
    height: number;
    origin: { x: number, y: number };
    grid: Cell[][];
    wallGrid: string[][];

    constructor(width: number, height: number, rng: Rng) {
        this.width = width;
        this.height = height;
        this.origin = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
        this.grid = this.initializeGrid();
        this.wallGrid = this.initializeWallGrid();
        this.generateMaze(rng);
        this.updateAllWalls();
    }

    initializeGrid(): Cell[][] {
        return Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => new Cell()));
    }

    initializeWallGrid(): string[][] {
        return Array.from({ length: this.height * 2 + 1 }, () => Array.from({ length: this.width * 2 + 1 }, () => '1111'));
    }

    generateMaze(rng: Rng) {
        const stack = [{ x: this.origin.x, y: this.origin.y }];
        this.grid[this.origin.y][this.origin.x].visited = true;
        this.grid[this.origin.y][this.origin.x].setDirection(0, 0);
        let visitedCount = 1;
        const totalCells = this.width * this.height;

        while (visitedCount < totalCells) {
            const current = stack[stack.length - 1];
            const neighbors = this.getUnvisitedNeighbors(current);

            if (neighbors.length > 0) {
                const next = rng.pick(neighbors);
                this.connectCells(current, next);
                stack.push(next);
                this.grid[next.y][next.x].visited = true;
                visitedCount++;
            } else {
                stack.pop();
            }
        }

        this.updateWallGrid();
    }

    updateWallGrid() {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const cell = this.grid[y][x];
                const wx = x * 2 + 1;
                const wy = y * 2 + 1;

                // Update center
                this.wallGrid[wy][wx] = '0000';

                // Update edges
                if (wy > 0) this.wallGrid[wy - 1][wx] = cell.walls[0] ? '0101' : '0000'; // top
                if (wx < this.width * 2) this.wallGrid[wy][wx + 1] = cell.walls[1] ? '1010' : '0000'; // right
                if (wy < this.height * 2) this.wallGrid[wy + 1][wx] = cell.walls[2] ? '0101' : '0000'; // bottom
                if (wx > 0) this.wallGrid[wy][wx - 1] = cell.walls[3] ? '1010' : '0000'; // left

                // Update corners
                this.updateCorner(wx - 1, wy - 1); // top-left
                this.updateCorner(wx + 1, wy - 1); // top-right
                if (y == this.height - 1) {
                    this.updateCorner(wx - 1, wy + 1); // bottom-left
                    this.updateCorner(wx + 1, wy + 1); // bottom-right
                }
            }
        }
    }

    updateCorner(x: number, y: number) {
        let code = '';
        code += (this.wallGrid[y - 1]?.[x] ?? '0000') !== '0000' ? '1' : '0'; // top-left
        code += (this.wallGrid[y]?.[x + 1] ?? '0000') !== '0000' ? '1' : '0'; // top-right
        code += (this.wallGrid[y + 1]?.[x] ?? '0000') !== '0000' ? '1' : '0'; // bottom-right
        code += (this.wallGrid[y]?.[x - 1] ?? '0000') !== '0000' ? '1' : '0'; // bottom-left
        this.wallGrid[y][x] = code;
    }

    getUnvisitedNeighbors(cell: { x: number, y: number }): { x: number, y: number, dir: { x: number, y: number } }[] {
        const neighbors: { x: number, y: number, dir: { x: number, y: number } }[] = [];

        for (const dir of DIRECTIONS) {
            const nx = cell.x + dir.x;
            const ny = cell.y + dir.y;
            if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                if (!this.grid[ny][nx].visited) {
                    neighbors.push({ x: nx, y: ny, dir });
                }
            }
        }

        return neighbors;
    }

    connectCells(from: { x: number, y: number }, to: { x: number, y: number }) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;

        if (dx === 1) {
            this.grid[from.y][from.x].walls[1] = false;
            this.grid[to.y][to.x].walls[3] = false;
        } else if (dx === -1) {
            this.grid[from.y][from.x].walls[3] = false;
            this.grid[to.y][to.x].walls[1] = false;
        } else if (dy === 1) {
            this.grid[from.y][from.x].walls[2] = false;
            this.grid[to.y][to.x].walls[0] = false;
        } else if (dy === -1) {
            this.grid[from.y][from.x].walls[0] = false;
            this.grid[to.y][to.x].walls[2] = false;
        }

        this.grid[to.y][to.x].setDirection(-dx, -dy);
    }

    updateAllWalls() {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.updateWalls(x, y);
            }
        }
        // Ensure outer walls are solid
        for (let x = 0; x < this.width; x++) {
            this.grid[0][x].walls[0] = true; // Top row
            this.grid[this.height - 1][x].walls[2] = true; // Bottom row
        }
        for (let y = 0; y < this.height; y++) {
            this.grid[y][0].walls[3] = true; // Left column
            this.grid[y][this.width - 1].walls[1] = true; // Right column
        }
    }

    updateWalls(x: number, y: number) {
        for (const dir of DIRECTIONS) {
            const nx = x + dir.x;
            const ny = y + dir.y;
            if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                this.updateWallBetweenCells(this.grid[y][x], this.grid[ny][nx], dir);
            }
        }
    }

    updateWallBetweenCells(cell1: Cell, cell2: Cell, dir: { x: number, y: number }) {
        if (cell1.direction && cell1.direction.x === dir.x && cell1.direction.y === dir.y) {
            // If cell1 points to cell2, remove the wall between them
            this.removeWall(cell1, cell2, dir);
        } else if (cell2.direction && cell2.direction.x === -dir.x && cell2.direction.y === -dir.y) {
            // If cell2 points to cell1, remove the wall between them
            this.removeWall(cell2, cell1, { x: -dir.x, y: -dir.y });
        } else {
            // Otherwise, ensure there's a wall between them
            this.addWall(cell1, cell2, dir);
        }
    }

    removeWall(cell1: Cell, cell2: Cell, dir: { x: number, y: number }) {
        if (dir.x === 1) {
            cell1.walls[1] = false;
            cell2.walls[3] = false;
        } else if (dir.x === -1) {
            cell1.walls[3] = false;
            cell2.walls[1] = false;
        } else if (dir.y === 1) {
            cell1.walls[2] = false;
            cell2.walls[0] = false;
        } else if (dir.y === -1) {
            cell1.walls[0] = false;
            cell2.walls[2] = false;
        }
    }

    addWall(cell1: Cell, cell2: Cell, dir: { x: number, y: number }) {
        if (dir.x === 1) {
            cell1.walls[1] = true;
            cell2.walls[3] = true;
        } else if (dir.x === -1) {
            cell1.walls[3] = true;
            cell2.walls[1] = true;
        } else if (dir.y === 1) {
            cell1.walls[2] = true;
            cell2.walls[0] = true;
        } else if (dir.y === -1) {
            cell1.walls[0] = true;
            cell2.walls[2] = true;
        }
    }

    /** Move the origin one step to a random in-bounds neighbour. Returns the old and new origin. */
    shift(rng: Rng): { from: { x: number, y: number }, to: { x: number, y: number } } {
        const from = { x: this.origin.x, y: this.origin.y };
        const validDirections = DIRECTIONS.filter(dir => {
            const nx = this.origin.x + dir.x;
            const ny = this.origin.y + dir.y;
            return nx >= 0 && nx < this.width && ny >= 0 && ny < this.height;
        });

        if (validDirections.length > 0) {
            const newDirection = rng.pick(validDirections);
            const newOrigin = {
                x: this.origin.x + newDirection.x,
                y: this.origin.y + newDirection.y
            };

            // Update direction relationship
            this.grid[this.origin.y][this.origin.x].setDirection(newDirection.x, newDirection.y);
            this.grid[newOrigin.y][newOrigin.x].setDirection(0, 0);

            // Update all walls based on the new direction relationships
            this.updateAllWalls();

            // Update the origin
            this.origin = newOrigin;
        }

        this.updateWallGrid();

        return { from, to: { x: this.origin.x, y: this.origin.y } };
    }

    /** True when (x, y) plus (dx, dy) stays in bounds and no wall blocks that step. */
    canMove(x: number, y: number, dx: number, dy: number): boolean {
        if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(dx) || !Number.isInteger(dy)) return false;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) return false;

        let wallIndex: number;
        if (dx === 0 && dy === -1) wallIndex = 0;      // up
        else if (dx === 1 && dy === 0) wallIndex = 1;  // right
        else if (dx === 0 && dy === 1) wallIndex = 2;  // down
        else if (dx === -1 && dy === 0) wallIndex = 3; // left
        else return false; // not a single cardinal step

        return !this.grid[y][x].walls[wallIndex];
    }
}

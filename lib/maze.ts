import Player from './player';
import GameState from './GameState';

class Cell {
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

class Item {
    type: string;
    sound: HTMLAudioElement;

    constructor(type: string) {
        this.type = type;
        this.sound = new Audio('/pickup.wav');
        this.sound.playbackRate = 1;
    }

    useItem(player: Player): string {
        this.sound.play();
        let message = '';
        switch (this.type) {
            case 'energy':
                player.energy = Math.min(player.energy_storage, player.energy + 25);
                message = '+25 Energy';
                break;
            case 'boots':
                player.energy_usage *= 0.95;
                message = '-5% Energy Use';
                break;
            case 'gloves':
                player.attack += 1;
                message = '+1 Attack';
                break;
            case 'shield':
                player.defense += 1;
                message = '+1 Defense';
                break;
            case 'speed':
                player.speed *= 1.1;
                message = '+10% Speed';
                break;
            case 'backpack':
                player.energy_storage += 10;
                player.energy += 10;
                message = '+10 Energy Storage';
                break;
        }
        return message;
    }
}

class Enemy {
    attack: number;
    energy: number;
    sound: HTMLAudioElement;

    constructor() {
        this.attack = 10;
        this.energy = 10;
        this.sound = new Audio('/fight.wav');
        this.sound.playbackRate = 2;
    }

    attackEnemy(player: Player): string {
        this.sound.play();
        let message = '';

        let energyCost = this.energy / player.attack * (this.attack - player.defense);
        player.energy -= energyCost;
        message = `-${Math.round(energyCost * 100) / 100} Energy to Defeat`;

        return message;
    }
}

class Maze {
    width: number;
    height: number;
    origin: { x: number, y: number };
    grid: Cell[][];
    wallGrid: string[][];

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.origin = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
        this.grid = this.initializeGrid();
        this.wallGrid = this.initializeWallGrid();
        this.generateMaze();
        this.updateAllWalls();
    }

    initializeGrid(): Cell[][] {
        return Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => new Cell()));
    }

    initializeWallGrid(): string[][] {
        return Array.from({ length: this.height * 2 + 1 }, () => Array.from({ length: this.width * 2 + 1 }, () => '1111'));
    }

    generateMaze() {
        const stack = [{ x: this.origin.x, y: this.origin.y }];
        this.grid[this.origin.y][this.origin.x].visited = true;
        this.grid[this.origin.y][this.origin.x].setDirection(0, 0);
        let visitedCount = 1;
        const totalCells = this.width * this.height;

        while (visitedCount < totalCells) {
            const current = stack[stack.length - 1];
            const neighbors = this.getUnvisitedNeighbors(current);

            if (neighbors.length > 0) {
                const next = neighbors[Math.floor(Math.random() * neighbors.length)];
                this.connectCells(current, next);
                stack.push(next);
                this.grid[next.y][next.x].visited = true;
                visitedCount++;
            } else {
                stack.pop();
            }

            if (stack.length === 0 && visitedCount < totalCells) {
                for (let y = 0; y < this.height; y++) {
                    for (let x = 0; x < this.width; x++) {
                        if (!this.grid[y][x].visited) {
                            stack.push({ x, y });
                            this.grid[y][x].visited = true;
                            this.grid[y][x].setDirection(0, 0);
                            visitedCount++;
                            break;
                        }
                    }
                    if (stack.length > 0) break;
                }
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
        const directions = [
            { x: 0, y: -1 }, // up
            { x: 1, y: 0 },  // right
            { x: 0, y: 1 },  // down
            { x: -1, y: 0 }  // left
        ];

        for (const dir of directions) {
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
        const directions = [
            { x: 0, y: -1 }, // up
            { x: 1, y: 0 },  // right
            { x: 0, y: 1 },  // down
            { x: -1, y: 0 }  // left
        ];

        for (const dir of directions) {
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

    shiftMaze() {
        const directions = [
            { x: 0, y: -1 }, // up
            { x: 1, y: 0 },  // right
            { x: 0, y: 1 },  // down
            { x: -1, y: 0 }  // left
        ];
        const validDirections = directions.filter(dir => {
            const nx = this.origin.x + dir.x;
            const ny = this.origin.y + dir.y;
            return nx >= 0 && nx < this.width && ny >= 0 && ny < this.height;
        });

        if (validDirections.length > 0) {
            const newDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
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
            this.updateOverlayPosition(newOrigin.x, newOrigin.y);
        }

        this.updateWallGrid();
    }

    addOverlay(x: number, y: number): void {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;

        const overlay = document.createElement('div');
        overlay.className = 'fade-overlay';
        overlay.style.width = '400px';
        overlay.style.height = '400px';
        overlay.style.left = `${x * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--item-size')) - 176}px`;
        overlay.style.top = `${y * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--item-size')) - 176}px`;
        mazeElement.appendChild(overlay);
    }

    updateOverlayPosition(x: number, y: number): void {
        const overlay = document.querySelector('.fade-overlay') as HTMLElement;
        if (overlay) {
            overlay.style.left = `${y * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--item-size')) - 176}px`;
            overlay.style.top = `${y * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--item-size')) - 176}px`;
        }
    }
}

export default Maze;
export { Cell, Item, Enemy };

// The only code that touches the board's DOM. The board is built once per level
// and patched in place: tileDiff decides which wall images get a new src, and
// every entity is one persistent element that glides to its new cell with a CSS
// transform. No React here; the shell (lib/GameState.ts) hands the board the Run.

import type { Run } from '@/game/run';
import { CONFIG } from '@/game/config';
import { blobRect } from '@/game/layout';
import { entityPx, markTiles, tileDiff } from '@/game/view';

/** Tile pictures live at images/<code>.png. */
const WALL_IMAGE_BASE = '/images/';

function copyGrid(grid: string[][]): string[][] {
    return grid.map((row) => row.slice());
}

export class Board {
    private tilesLayer: HTMLElement | null = null;
    private entitiesLayer: HTMLElement | null = null;
    private fxLayer: HTMLElement | null = null;
    /** The layer inside .fx holding the forecast's wall marks, replaced on each update. */
    private marksLayer: HTMLElement | null = null;

    /** The wall images by [row][column] of the wall grid. */
    private tileImages: HTMLImageElement[][] = [];
    /** A private copy of the last painted wallGrid, the base for tileDiff. */
    private lastGrid: string[][] | null = null;
    /** The tile size in whole pixels, from the layout's boardLayout. */
    private cell: number = 4;
    /** The run the elements were last drawn from, so resize() can re-place them. */
    private lastRun: Run | null = null;

    private playerElement: HTMLElement | null = null;
    private playerSprite: HTMLElement | null = null;
    private layerImages: HTMLImageElement[] = [];
    private exitElement: HTMLElement | null = null;
    private blobElement: HTMLElement | null = null;
    /** The Knot: one persistent element on the origin's tile, gliding as it moves. */
    private knotElement: HTMLElement | null = null;
    /** Entity elements keyed by the stable ids run.items / run.enemies carry. */
    private itemElements: Map<number, HTMLElement> = new Map();
    private enemyElements: Map<number, HTMLElement> = new Map();

    /** Create the three layers inside #maze: the grid, the gliding entities and the effects. */
    mount(el: HTMLElement): void {
        this.tilesLayer = document.createElement('div');
        this.tilesLayer.className = 'tiles';
        this.entitiesLayer = document.createElement('div');
        this.entitiesLayer.className = 'entities';
        this.fxLayer = document.createElement('div');
        this.fxLayer.className = 'fx';
        this.marksLayer = document.createElement('div');
        this.marksLayer.className = 'marks';
        this.fxLayer.appendChild(this.marksLayer);
        el.replaceChildren(this.tilesLayer, this.entitiesLayer, this.fxLayer);

        this.tileImages = [];
        this.lastGrid = null;
        this.lastRun = null;
        this.playerElement = null;
        this.playerSprite = null;
        this.layerImages = [];
        this.exitElement = null;
        this.blobElement = null;
        this.knotElement = null;
        this.itemElements.clear();
        this.enemyElements.clear();
    }

    /** Rebuild the tile grid for the level's size and create the entity elements. */
    setLevel(run: Run, cell: number): void {
        this.cell = cell;
        this.lastRun = run;
        this.buildTiles(run);
        this.buildEntities(run);
    }

    /**
     * Patch the board after a move: only the changed tiles get a new src, every
     * entity slides to its cell, and elements of pickups and enemies that are gone
     * are removed.
     */
    update(run: Run): void {
        this.lastRun = run;
        const grid = run.maze.wallGrid;
        for (const change of tileDiff(this.lastGrid, grid)) {
            const image = this.tileImages[change.y]?.[change.x];
            if (image) image.src = `${WALL_IMAGE_BASE}${change.code}.png`;
        }
        this.lastGrid = copyGrid(grid);
        this.placeAll(run);
    }

    /** Re-apply every position for a new tile size (the window was resized). */
    resize(cell: number): void {
        this.cell = cell;
        if (this.lastRun && this.playerElement) this.placeAll(this.lastRun);
    }

    /** Float a text over the given cell of the maze; it goes when its animation ends. */
    float(text: string, cellX: number, cellY: number): void {
        if (!this.fxLayer) return;
        const message = document.createElement('div');
        message.className = 'message';
        message.textContent = text;
        const { x, y } = entityPx(cellX, cellY, this.cell);
        // left/top, not a transform: the moveUp animation owns the transform.
        message.style.left = `${x}px`;
        message.style.top = `${y}px`;
        message.addEventListener('animationend', () => message.remove(), { once: true });
        this.fxLayer.appendChild(message);
    }

    /**
     * Point the one persistent player element's stacked layers at the given frame
     * URLs (the shell's sprite timer calls this).
     */
    setSprite(urls: string[]): void {
        if (!this.playerSprite) return;
        if (urls.length !== this.layerImages.length) {
            // The look changed while the element existed: rebuild the stack.
            this.layerImages.forEach((image) => image.remove());
            this.layerImages = [];
            for (const url of urls) {
                const layerImage = document.createElement('img');
                layerImage.className = 'player-layer';
                layerImage.src = url;
                layerImage.alt = '';
                this.playerSprite.appendChild(layerImage);
                this.layerImages.push(layerImage);
            }
            return;
        }
        urls.forEach((url, index) => {
            const image = this.layerImages[index];
            if (image.getAttribute('src') !== url) image.setAttribute('src', url);
        });
    }

    // --- internals -------------------------------------------------------

    private buildTiles(run: Run): void {
        if (!this.tilesLayer) return;
        const grid = run.maze.wallGrid;
        this.tilesLayer.replaceChildren();
        this.tileImages = [];
        for (let y = 0; y < grid.length; y++) {
            const row: HTMLImageElement[] = [];
            for (let x = 0; x < grid[y].length; x++) {
                const image = document.createElement('img');
                image.className = 'wall-image';
                image.src = `${WALL_IMAGE_BASE}${grid[y][x]}.png`;
                image.alt = '';
                this.tilesLayer.appendChild(image);
                row.push(image);
            }
            this.tileImages.push(row);
        }
        this.lastGrid = copyGrid(grid);
    }

    private buildEntities(run: Run): void {
        if (!this.entitiesLayer) return;
        this.entitiesLayer.replaceChildren();
        this.itemElements.clear();
        this.enemyElements.clear();
        this.layerImages = [];

        this.playerElement = document.createElement('div');
        this.playerElement.className = 'player';
        // The outer element's transform carries the position; the inner wrapper
        // holds the stacked layers and carries the facing flip.
        this.playerSprite = document.createElement('div');
        this.playerSprite.className = 'player-sprite';
        this.playerElement.appendChild(this.playerSprite);
        this.entitiesLayer.appendChild(this.playerElement);

        this.exitElement = document.createElement('div');
        this.exitElement.className = 'exit';
        this.entitiesLayer.appendChild(this.exitElement);

        // The blob first, so the Knot is drawn on top of its aura.
        this.blobElement = document.createElement('div');
        this.blobElement.className = 'fade-overlay';
        this.entitiesLayer.appendChild(this.blobElement);

        this.knotElement = document.createElement('div');
        this.knotElement.className = 'knot';
        this.entitiesLayer.appendChild(this.knotElement);

        this.placeAll(run);
    }

    /** Place every entity of the run at the current cell size. */
    private placeAll(run: Run): void {
        this.place(this.playerElement, run.player.x, run.player.y);
        this.place(this.exitElement, run.exit.x, run.exit.y);
        this.syncItems(run);
        this.syncEnemies(run);
        this.placeBlob(run);
        this.placeKnot(run);
        this.syncMarks(run);
        this.playerSprite?.classList.toggle('flip-horizontal', run.player.facingLeft);
    }

    private place(element: HTMLElement | null, cellX: number, cellY: number): void {
        if (!element) return;
        const { x, y } = entityPx(cellX, cellY, this.cell);
        element.style.transform = `translate(${x}px, ${y}px)`;
    }

    private syncItems(run: Run): void {
        const alive = new Set<number>();
        for (const item of run.items) {
            alive.add(item.id);
            let element = this.itemElements.get(item.id);
            if (!element) {
                element = document.createElement('div');
                this.itemElements.set(item.id, element);
                this.entitiesLayer?.appendChild(element);
            }
            element.className = `powerup item_${item.type}`;
            this.place(element, item.x, item.y);
        }
        for (const [id, element] of this.itemElements) {
            if (!alive.has(id)) {
                element.remove();
                this.itemElements.delete(id);
            }
        }
    }

    private syncEnemies(run: Run): void {
        const alive = new Set<number>();
        for (const enemy of run.enemies) {
            alive.add(enemy.id);
            let element = this.enemyElements.get(enemy.id);
            if (!element) {
                element = document.createElement('div');
                // The badge is the one child: it rides along with the enemy's glide.
                element.appendChild(document.createElement('div'));
                this.enemyElements.set(enemy.id, element);
                this.entitiesLayer?.appendChild(element);
            }
            // Kind classes change the shape (CSS only); the badge shows the current
            // toll and is refreshed on every update because stats and energy move.
            element.className = `enemy enemy-${enemy.kind}`;
            const badge = element.firstElementChild;
            if (badge instanceof HTMLElement) {
                const toll = run.tollOf(enemy);
                badge.className = 'toll';
                badge.textContent = String(toll);
                badge.classList.toggle('toll-fatal', toll >= run.energy);
            }
            this.place(element, enemy.x, enemy.y);
        }
        for (const [id, element] of this.enemyElements) {
            if (!alive.has(id)) {
                element.remove();
                this.enemyElements.delete(id);
            }
        }
    }

    private placeBlob(run: Run): void {
        if (!this.blobElement) return;
        const { left, top, size } = blobRect(run.maze.origin, this.cell, CONFIG.blobTiles);
        this.blobElement.style.width = `${size}px`;
        this.blobElement.style.height = `${size}px`;
        this.blobElement.style.transform = `translate(${left}px, ${top}px)`;
    }

    private placeKnot(run: Run): void {
        if (!this.knotElement) return;
        const { x, y } = entityPx(run.maze.origin.x, run.maze.origin.y, this.cell);
        this.knotElement.style.width = `${this.cell}px`;
        this.knotElement.style.height = `${this.cell}px`;
        this.knotElement.style.transform = `translate(${x}px, ${y}px)`;
    }

    /** Replace the wall marks with one element per tile the forecast changes. */
    private syncMarks(run: Run): void {
        if (!this.marksLayer) return;
        const forecast = run.forecast;
        if (!forecast) {
            this.marksLayer.replaceChildren();
            return;
        }
        const marks: HTMLElement[] = [];
        for (const mark of markTiles(forecast)) {
            const element = document.createElement('div');
            element.className = `mark mark-${mark.kind}`;
            element.style.left = `${mark.tx * this.cell}px`;
            element.style.top = `${mark.ty * this.cell}px`;
            element.style.width = `${this.cell}px`;
            element.style.height = `${this.cell}px`;
            marks.push(element);
        }
        this.marksLayer.replaceChildren(...marks);
    }
}

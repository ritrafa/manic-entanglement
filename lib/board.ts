// The only code that touches the board's DOM. The board is built once per level
// and patched in place: tileDiff decides which wall images get a new src, and
// every entity is one persistent element that glides to its new cell with a CSS
// transform. No React here; the shell (lib/GameState.ts) hands the board the Run.

import type { Run } from '@/game/run';
import { CONFIG, FX } from '@/game/config';
import { blobRect } from '@/game/layout';
import { entityPx, markTiles, tileDiff } from '@/game/view';
import type { Fx, FxTone } from '@/game/fx';

/** Tile pictures live at images/<code>.png. */
const WALL_IMAGE_BASE = '/images/';

/** Milliseconds an effect element waits past its animation before the fallback
    timeout removes it, so a missed animationend never leaves it on the board. */
const EFFECT_GRACE_MS = 250;

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
    /** The element mount() received (#maze): shake and zoom animate this, not the page. */
    private boardElement: HTMLElement | null = null;
    /** The live spark particles, oldest first; playBurst() keeps the cap. */
    private sparks: HTMLElement[] = [];

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

        this.boardElement = el;
        this.sparks = [];
        el.classList.remove('fx-shake', 'fx-zoom', 'low-energy');

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
     * Draw one effect from the shell's effects bus (game/fx.ts fxFor): the
     * bump nudges the player's inner element, pops, sparks and veils live on
     * the fx layer and go when their animation ends, and shake and zoom
     * animate the board container itself. Every element is gone soon after:
     * nothing a play() leaves can outlive its animation by more than a grace.
     */
    play(fx: Fx): void {
        if (!this.fxLayer || !this.boardElement) return;
        switch (fx.kind) {
            case 'bump':
                this.playBump(fx.dx, fx.dy);
                break;
            case 'pop':
                this.playPop(fx.x, fx.y);
                break;
            case 'burst':
                this.playBurst(fx.x, fx.y, fx.count, fx.tone);
                break;
            case 'flash':
                this.playVeil(fx.tone, fx.ms);
                break;
            case 'fade':
                this.playVeil(null, fx.ms);
                break;
            case 'shake':
                this.playShake(fx.px, fx.ms);
                break;
            case 'zoom':
                this.playZoom(fx.x, fx.y, fx.ms);
                break;
        }
    }

    /** The board breathes a warning while the shell says the energy is low. */
    setLowEnergy(on: boolean): void {
        this.boardElement?.classList.toggle('low-energy', on);
    }

    private playBump(dx: number, dy: number): void {
        const sprite = this.playerSprite;
        if (!sprite) return;
        const px = Math.max(2, Math.round(this.cell * 0.4));
        sprite.style.setProperty('--bump-dx', `${Math.round(dx) * px}px`);
        sprite.style.setProperty('--bump-dy', `${Math.round(dy) * px}px`);
        this.restartAnimation(sprite, 'fx-bump');
    }

    private playPop(cellX: number, cellY: number): void {
        const pop = document.createElement('div');
        pop.className = 'fx-pop';
        const { x, y } = entityPx(cellX, cellY, this.cell);
        pop.style.left = `${x}px`;
        pop.style.top = `${y}px`;
        pop.style.setProperty('--fx-ms', `${FX.popMs}ms`);
        this.spawnTemporary(pop, FX.popMs);
    }

    /** Throw count particles from the cell, oldest-first capped at FX.maxParticles. */
    private playBurst(cellX: number, cellY: number, count: number, tone: FxTone): void {
        const whole = Math.max(0, Math.floor(count));
        const { x, y } = entityPx(cellX, cellY, this.cell);
        for (let i = 0; i < whole; i++) {
            const spark = document.createElement('div');
            spark.className = `spark spark-${tone}`;
            spark.style.left = `${x}px`;
            spark.style.top = `${y}px`;
            // Even spread, no randomness: the ring reads as thrown from the cell.
            const angle = (i / Math.max(1, whole)) * Math.PI * 2;
            const distance = Math.round(this.cell * (0.8 + (i % 3) * 0.35));
            spark.style.setProperty('--sx', `${Math.round(Math.cos(angle) * distance)}px`);
            spark.style.setProperty('--sy', `${Math.round(Math.sin(angle) * distance)}px`);
            spark.style.setProperty('--fx-ms', `${FX.sparkMs}ms`);
            this.spawnTemporary(spark, FX.sparkMs);
            this.sparks.push(spark);
        }
        // The cap: sparks already gone leave the list, the oldest living ones go first.
        this.sparks = this.sparks.filter((spark) => spark.isConnected);
        while (this.sparks.length > FX.maxParticles) {
            this.sparks.shift()?.remove();
        }
    }

    /** A colour wash (flash) or the dark stand-in (fade) over the whole board. */
    private playVeil(tone: FxTone | null, ms: number): void {
        const veil = document.createElement('div');
        veil.className = tone === null ? 'fx-veil fx-fade' : `fx-veil fx-flash fx-flash-${tone}`;
        const whole = Math.max(1, Math.round(ms));
        veil.style.setProperty('--fx-ms', `${whole}ms`);
        this.spawnTemporary(veil, whole);
    }

    private playShake(px: number, ms: number): void {
        const board = this.boardElement;
        if (!board) return;
        const whole = Math.max(1, Math.round(ms));
        board.style.setProperty('--shake-px', `${Math.max(1, Math.round(px))}px`);
        this.restartAnimation(board, 'fx-shake', whole);
    }

    private playZoom(cellX: number, cellY: number, ms: number): void {
        const board = this.boardElement;
        if (!board) return;
        const whole = Math.max(1, Math.round(ms));
        const { x, y } = entityPx(cellX, cellY, this.cell);
        board.style.setProperty('--zoom-origin', `${x}px ${y}px`);
        this.restartAnimation(board, 'fx-zoom', whole);
    }

    /** Put an effect element on the fx layer, gone at animationend or on the timeout. */
    private spawnTemporary(element: HTMLElement, ms: number): void {
        if (!this.fxLayer) return;
        element.addEventListener('animationend', () => element.remove(), { once: true });
        setTimeout(() => element.remove(), ms + EFFECT_GRACE_MS);
        this.fxLayer.appendChild(element);
    }

    /** (Re)start a class-driven animation on a persistent element, even mid-run. */
    private restartAnimation(element: HTMLElement, className: string, ms?: number): void {
        element.classList.remove(className);
        // Reading the layout flushes the removal, so adding the class starts fresh.
        void element.offsetWidth;
        if (ms !== undefined) element.style.setProperty('--fx-ms', `${ms}ms`);
        element.classList.add(className);
        setTimeout(() => element.classList.remove(className), (ms ?? 200) + EFFECT_GRACE_MS);
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
        // The bump class goes when its nudge ends (playBump puts it back).
        this.playerSprite.addEventListener('animationend', (event) => {
            if (event.animationName === 'bump-nudge') this.playerSprite?.classList.remove('fx-bump');
        });
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
        // While an Anchor holds, the Knot stops pulsing and shows a dashed ring:
        // the maze is frozen (game/tools.ts, styles/globals.css .knot-frozen).
        this.knotElement.classList.toggle('knot-frozen', run.anchored > 0);
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

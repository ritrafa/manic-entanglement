// The only code that touches the board's DOM. The board is built once per level
// and patched in place: tileDiff decides which wall images get a new src, and
// every entity is one persistent element that glides to its new cell with a CSS
// transform. No React here; the shell (lib/GameState.ts) hands the board the Run.

import type { Run } from '@/game/run';
import { CONFIG, FX } from '@/game/config';
import { visibleCells } from '@/game/modifiers';
import { blobRect } from '@/game/layout';
import type { BoardViewport } from '@/game/layout';
import { cameraOffset } from '@/game/camera';
import type { CameraWindow } from '@/game/camera';
import { entityPx, markTiles, tileDiff } from '@/game/view';
import type { Fx, FxTone } from '@/game/fx';

/** Tile pictures live at images/<code>.png. */
const WALL_IMAGE_BASE = '/images/';

/** Whether the sixteen wall pictures have already been warmed into the
    browser cache. mount() does it once per page load, so a wall whose code
    changes never flashes empty while its PNG is still in flight. */
let wallImagesPreloaded = false;

/** Warm the HTTP cache with all sixteen wall codes (0000.png ... 1111.png). */
function preloadWallImages(): void {
    if (wallImagesPreloaded) return;
    wallImagesPreloaded = true;
    for (let code = 0; code < 16; code += 1) {
        const warm = new Image();
        warm.src = `${WALL_IMAGE_BASE}${code.toString(2).padStart(4, '0')}.png`;
    }
}

/** Milliseconds an effect element waits past its animation before the fallback
    timeout removes it, so a missed animationend never leaves it on the board. */
const EFFECT_GRACE_MS = 250;
/** Milliseconds the gold flash on a Cut-opened wall tile lasts. */
const TILE_FLASH_MS = 450;
/** The E56 minimap's side in pixels: a small square in a board corner. */
const MINIMAP_PX = 96;
/** The minimap draws each wall-grid tile at 1 or 2 CSS pixels, never more
    (times the device pixel ratio in the drawing buffer). */
const MINIMAP_MAX_TILE_PX = 2;
/** The side of a PFP master in art pixels (public/images/nft/<Layer>/<Trait>pfp.png). */
const PFP_ART_PX = 16;
/** A trait PFP crop this wide or narrower is drawn at two tile pixels per art pixel. */
const TRAIT_CROP_SCALE_UP = 8;

/** The opaque bounding box of a PFP master, in art pixels, or null when the
    sprite is empty or its pixels cannot be read. */
function traitBoundingBox(image: HTMLImageElement): { x: number; y: number; w: number; h: number } | null {
    const canvas = document.createElement('canvas');
    canvas.width = PFP_ART_PX;
    canvas.height = PFP_ART_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, PFP_ART_PX, PFP_ART_PX);
    ctx.drawImage(image, 0, 0, PFP_ART_PX, PFP_ART_PX);
    let data: Uint8ClampedArray;
    try {
        data = ctx.getImageData(0, 0, PFP_ART_PX, PFP_ART_PX).data;
    } catch {
        return null;
    }
    let minX = PFP_ART_PX;
    let minY = PFP_ART_PX;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < PFP_ART_PX; y++) {
        for (let x = 0; x < PFP_ART_PX; x++) {
            if (data[(y * PFP_ART_PX + x) * 4 + 3] === 0) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < minX || maxY < minY) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Crop a trait pickup's floor sprite to its PFP's bounding box
 * (design/pixel-art.md, "Trait pickups on the board"): two tile pixels per
 * art pixel when the crop is at most 8 by 8, otherwise one, centred by CSS.
 * Until the picture has loaded (or when its pixels cannot be read) the CSS
 * default stands: the whole 16 at one tile pixel each.
 */
function applyTraitCrop(crop: HTMLElement, url: string): void {
    const image = new Image();
    image.onload = () => {
        const box = traitBoundingBox(image);
        if (box === null) return;
        const scale = box.w <= TRAIT_CROP_SCALE_UP && box.h <= TRAIT_CROP_SCALE_UP ? 2 : 1;
        crop.style.width = `${box.w * scale}px`;
        crop.style.height = `${box.h * scale}px`;
        crop.style.backgroundSize = `${PFP_ART_PX * scale}px ${PFP_ART_PX * scale}px`;
        crop.style.backgroundPosition = `${-box.x * scale}px ${-box.y * scale}px`;
    };
    image.src = url;
}

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
    /** The one trait pickup element of the level (E58), null when none dropped. */
    private traitElement: HTMLElement | null = null;
    private enemyElements: Map<number, HTMLElement> = new Map();
    /** The element mount() received (#maze): shake and zoom animate this, not the page. */
    private boardElement: HTMLElement | null = null;
    /** The live spark particles, oldest first; playBurst() keeps the cap. */
    private sparks: HTMLElement[] = [];
    /**
     * The Blackout view of the level last drawn: which cells show, indexed
     * [y][x] (game/modifiers.ts visibleCells). Null on a plain level, where
     * every tile and entity is visible.
     */
    private visible: boolean[][] | null = null;

    /**
     * The E56 viewport the layers were last sized for: whole-maze, or a
     * camera window that slides over the full-maze layers to follow the
     * reptile. Null before the first setLevel.
     */
    private viewport: BoardViewport | null = null;
    /** Where the camera window last sat in the wall grid (game/camera.ts). */
    private camera: CameraWindow | null = null;
    /** The minimap canvas mount() creates; only shown in camera mode. */
    private minimapCanvas: HTMLCanvasElement | null = null;
    /** Raised whenever the wall grid changes, part of the minimap's redraw key. */
    private gridRevision = 0;
    /** The last thing the minimap drew, so a move that changed nothing skips it. */
    private minimapSignature: string | null = null;

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
        // The E56 minimap: a small canvas in a board corner, shown only when
        // the maze is too big to draw whole. The CSS (well, line border) draws
        // the frame; the canvas draws the maze, the reptile, the exit and the
        // window.
        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.className = 'minimap';
        this.minimapCanvas.hidden = true;
        el.replaceChildren(this.tilesLayer, this.entitiesLayer, this.fxLayer, this.minimapCanvas);

        this.boardElement = el;
        this.sparks = [];
        // The wall pictures are fetched once, up front: the first time a tile
        // changes its code the picture is already in the cache.
        preloadWallImages();
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
        this.traitElement = null;
        this.visible = null;
        this.viewport = null;
        this.camera = null;
        this.gridRevision = 0;
        this.minimapSignature = null;
    }

    /** Rebuild the tile grid for the level's size and create the entity elements. */
    setLevel(run: Run, cell: number, viewport: BoardViewport | null = null): void {
        this.cell = cell;
        this.lastRun = run;
        this.viewport = viewport;
        this.gridRevision += 1;
        this.applyViewport();
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
        const changes = tileDiff(this.lastGrid, grid);
        for (const change of changes) {
            const image = this.tileImages[change.y]?.[change.x];
            if (image) image.src = `${WALL_IMAGE_BASE}${change.code}.png`;
        }
        if (changes.length > 0) this.gridRevision += 1;
        this.lastGrid = copyGrid(grid);
        this.placeAll(run);
    }

    /** Re-apply every position for a new tile size (the window was resized). */
    resize(cell: number, viewport: BoardViewport | null = null): void {
        this.cell = cell;
        this.viewport = viewport;
        this.applyViewport();
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
     * A brief gold flash on the wall-grid tile between the cell (cellX, cellY)
     * and its neighbour at (dx, dy): the wall a successful Cut just opened.
     * Lives on the fx layer and goes when its animation ends; a board without
     * an fx layer (never mounted) draws nothing at all.
     */
    flashWallTile(cellX: number, cellY: number, dx: number, dy: number): void {
        if (!this.fxLayer) return;
        // The wall tile sits between the two cell tiles of the wall grid.
        const gx = cellX * 2 + 1 + dx;
        const gy = cellY * 2 + 1 + dy;
        if (gx < 0 || gy < 0) return;
        const flash = document.createElement('div');
        flash.className = 'fx-tile-flash';
        const half = this.cell / 2;
        flash.style.left = `${gx * half}px`;
        flash.style.top = `${gy * half}px`;
        flash.style.width = `${half}px`;
        flash.style.height = `${half}px`;
        this.spawnTemporary(flash, TILE_FLASH_MS);
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

    /**
     * Show the entanglement banner (game/modifiers.ts) over the board for `ms`
     * milliseconds: the twist's name and its line as real text, gone when the
     * time is up. A second call replaces the banner still standing.
     */
    banner(name: string, line: string, ms: number): void {
        const board = this.boardElement;
        if (!board) return;
        board.querySelector('.level-banner')?.remove();
        const banner = document.createElement('div');
        banner.className = 'level-banner';
        const title = document.createElement('strong');
        title.textContent = name;
        const text = document.createElement('span');
        text.textContent = line;
        banner.append(title, text);
        board.appendChild(banner);
        setTimeout(() => banner.remove(), Math.max(1, Math.round(ms)));
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
        // In camera mode the cell sits this far into the window, not into the maze.
        const shiftX = this.camera !== null ? this.camera.x * this.cell : 0;
        const shiftY = this.camera !== null ? this.camera.y * this.cell : 0;
        board.style.setProperty('--zoom-origin', `${x - shiftX}px ${y - shiftY}px`);
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
        this.traitElement = null;
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
        this.syncVisibility(run);
        this.place(this.playerElement, run.player.x, run.player.y);
        this.place(this.exitElement, run.exit.x, run.exit.y);
        this.syncTileVisibility();
        this.syncItems(run);
        this.syncTrait(run);
        this.syncEnemies(run);
        this.placeBlob(run);
        this.placeKnot(run);
        this.syncMarks(run);
        this.playerSprite?.classList.toggle('flip-horizontal', run.player.facingLeft);
        this.applyCamera(run);
        this.drawMinimap(run);
    }

    private place(element: HTMLElement | null, cellX: number, cellY: number): void {
        if (!element) return;
        const { x, y } = entityPx(cellX, cellY, this.cell);
        element.style.transform = `translate(${x}px, ${y}px)`;
    }

    /**
     * Recompute the Blackout view (game/modifiers.ts): the cells near the
     * player plus the Knot, the forecast walk and the exit. On a plain level
     * the view is null and everything shows. Called on every draw, so the view
     * follows each move and every re-rolled forecast.
     */
    private syncVisibility(run: Run): void {
        if (run.vision === null) {
            this.visible = null;
            return;
        }
        this.visible = visibleCells({
            size: run.maze.width,
            player: run.player,
            knot: run.maze.origin,
            exit: run.exit,
            walk: run.forecast ? run.forecast.walk : [],
            radius: run.vision,
        });
    }

    /** True when cell (cellX, cellY) shows: always off Blackout, by the view on it. */
    private cellShown(cellX: number, cellY: number): boolean {
        if (this.visible === null) return true;
        return this.visible[cellY]?.[cellX] === true;
    }

    /**
     * True when the wall-grid tile (tx, ty) shows: a tile belongs to the cell
     * it sits in, and a wall or corner tile touches the cells around it — it
     * shows when any of them does, so the walls between two visible cells are
     * visible and the edge of the light is drawn.
     */
    private tileShown(tx: number, ty: number): boolean {
        if (this.visible === null) return true;
        const xs = tx % 2 === 1 ? [(tx - 1) / 2] : [tx / 2 - 1, tx / 2];
        const ys = ty % 2 === 1 ? [(ty - 1) / 2] : [ty / 2 - 1, ty / 2];
        for (const y of ys) {
            for (const x of xs) {
                if (this.visible[y]?.[x] === true) return true;
            }
        }
        return false;
    }

    /** Dim the tiles outside the Blackout view; a plain level lights them all. */
    private syncTileVisibility(): void {
        for (let ty = 0; ty < this.tileImages.length; ty++) {
            const row = this.tileImages[ty];
            for (let tx = 0; tx < row.length; tx++) {
                row[tx].classList.toggle('unseen', !this.tileShown(tx, ty));
            }
        }
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
            element.classList.toggle('unseen', !this.cellShown(item.x, item.y));
            this.place(element, item.x, item.y);
        }
        for (const [id, element] of this.itemElements) {
            if (!alive.has(id)) {
                element.remove();
                this.itemElements.delete(id);
            }
        }
    }

    /**
     * The trait pickup of the level (E58): one persistent element like an
     * item, holding the PFP cropped to its bounding box (`.trait-crop`, sized
     * by applyTraitCrop) inside the middle 16 tile pixels, with the four
     * rarity corner brackets (`.trait-frame`, coloured by CSS).
     */
    private syncTrait(run: Run): void {
        const trait = run.trait;
        if (trait === null) {
            if (this.traitElement !== null) {
                this.traitElement.remove();
                this.traitElement = null;
            }
            return;
        }
        if (this.traitElement === null) {
            const element = document.createElement('div');
            const crop = document.createElement('div');
            crop.className = 'trait-crop';
            const frame = document.createElement('div');
            frame.className = 'trait-frame';
            // The four corner brackets: one <i> each, drawn entirely by CSS.
            for (let corner = 0; corner < 4; corner += 1) frame.appendChild(document.createElement('i'));
            element.append(crop, frame);
            this.traitElement = element;
            this.entitiesLayer?.appendChild(element);
        }
        const element = this.traitElement;
        element.className = `powerup trait-pickup trait-${trait.rarity}`;
        element.classList.toggle('unseen', !this.cellShown(trait.x, trait.y));
        const crop = element.querySelector('.trait-crop');
        if (crop instanceof HTMLElement) {
            const url = `/images/nft/${trait.layer}/${trait.trait}pfp.png`;
            if (crop.dataset.src !== url) {
                crop.dataset.src = url;
                crop.style.width = '';
                crop.style.height = '';
                crop.style.backgroundSize = '';
                crop.style.backgroundPosition = '';
                crop.style.backgroundImage = `url("${url}")`;
                applyTraitCrop(crop, url);
            }
        }
        this.place(element, trait.x, trait.y);
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
            element.classList.toggle('unseen', !this.cellShown(enemy.x, enemy.y));
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

    /**
     * Size the three layers for the viewport last set (E56). Whole-maze, they
     * are the board as always (the grid from the CSS variables, the absolute
     * layers at 100%). In camera mode each draws the WHOLE maze at the camera
     * cell — so they get the maze's pixel size outright, or the tiles grid
     * would centre its own overflow — and `applyCamera` slides them. The
     * `camera-move` class gives the slide the reptile's glide timing (CSS).
     */
    private applyViewport(): void {
        const viewport = this.viewport;
        const camera = viewport !== null && viewport.mode === 'camera';
        const size = viewport !== null && viewport.mode === 'camera' ? `${viewport.board}px` : '';
        for (const layer of [this.tilesLayer, this.entitiesLayer, this.fxLayer]) {
            if (!layer) continue;
            layer.style.width = size;
            layer.style.height = size;
            layer.classList.toggle('camera-move', camera);
        }
    }

    /**
     * Slide the layers so the camera window keeps the reptile centred
     * (game/camera.ts): the whole-maze layers shift by minus the window's
     * top-left tile, clamped at the maze's edges. The `camera-move` transition
     * makes it the same glide as the reptile's; under reduced motion the CSS
     * drops it and the window jumps.
     */
    private applyCamera(run: Run): void {
        const viewport = this.viewport;
        if (viewport === null || viewport.mode !== 'camera') {
            this.camera = null;
            for (const layer of [this.tilesLayer, this.entitiesLayer, this.fxLayer]) {
                if (layer) layer.style.transform = '';
            }
            return;
        }
        const tiles = run.maze.wallGrid.length;
        // The reptile's tile in the wall grid, the space the window counts in.
        this.camera = cameraOffset(
            { x: 2 * run.player.x + 1, y: 2 * run.player.y + 1 },
            tiles,
            viewport.viewTiles,
        );
        const shift = `translate(${-this.camera.x * this.cell}px, ${-this.camera.y * this.cell}px)`;
        for (const layer of [this.tilesLayer, this.entitiesLayer, this.fxLayer]) {
            if (layer) layer.style.transform = shift;
        }
    }

    /**
     * Redraw the minimap: the whole maze's walls at 1 or 2 pixels a tile, the
     * reptile and the exit as single bright pixels and the camera window as an
     * outline, on a ~96 px square at the device pixel ratio, whole pixels per
     * tile (the CSS draws its well and line frame).
     * Shown only in camera mode, and on a Blackout level it keeps its secret:
     * nothing but the reptile and the frame. Redrawn only when the maze, the
     * reptile, the window or the twist changed.
     */
    private drawMinimap(run: Run): void {
        const canvas = this.minimapCanvas;
        const viewport = this.viewport;
        const camera = viewport !== null && viewport.mode === 'camera';
        if (!canvas) return;
        canvas.hidden = !camera;
        if (!camera || this.camera === null) return;
        const blackout = run.vision !== null;
        const gridTiles = run.maze.wallGrid.length;
        // E59: the drawing buffer is exactly the square CSS displays times the
        // device pixel ratio, rounded to whole pixels, so one canvas pixel
        // lands on one screen pixel and nothing is rescaled. Each wall-grid
        // tile then draws at a whole number of buffer pixels (CSS keeps it
        // nearest-neighbour with image-rendering: pixelated).
        const dpr = window.devicePixelRatio || 1;
        const cssSide = canvas.clientWidth || MINIMAP_PX;
        const side = Math.max(1, Math.round(cssSide * dpr));
        const maxTilePx = Math.max(1, Math.round(MINIMAP_MAX_TILE_PX * dpr));
        const px = Math.min(maxTilePx, Math.max(1, Math.floor(side / gridTiles)));
        const signature = [
            this.gridRevision,
            run.player.x, run.player.y,
            this.camera.x, this.camera.y,
            blackout ? 'b' : 'p',
            this.cell,
            side,
        ].join(':');
        if (signature === this.minimapSignature) return;
        this.minimapSignature = signature;

        if (canvas.width !== side) {
            canvas.width = side;
            canvas.height = side;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, side, side);
        const tokens = getComputedStyle(document.documentElement);
        const wallColour = tokens.getPropertyValue('--line').trim() || '#0b9363';
        const bright = tokens.getPropertyValue('--ink').trim() || '#ffffff';
        const exitColour = tokens.getPropertyValue('--gold').trim() || '#ffd700';
        if (!blackout) {
            ctx.fillStyle = wallColour;
            for (let ty = 0; ty < gridTiles; ty++) {
                const row = run.maze.wallGrid[ty];
                for (let tx = 0; tx < row.length; tx++) {
                    if (row[tx] === '0000') continue;
                    ctx.fillRect(tx * px, ty * px, px, px);
                }
            }
            this.paintMinimapPixel(ctx, run.exit.x, run.exit.y, px, exitColour);
            // The camera window as an outline, one buffer pixel wide and
            // crisp: a half-pixel inset only when the line is an odd width.
            ctx.strokeStyle = bright;
            const lineWidth = Math.max(1, Math.round(dpr));
            ctx.lineWidth = lineWidth;
            const inset = lineWidth % 2 === 1 ? 0.5 : 0;
            ctx.strokeRect(
                this.camera.x * px + inset,
                this.camera.y * px + inset,
                viewport.viewTiles * px - lineWidth,
                viewport.viewTiles * px - lineWidth,
            );
        }
        // The reptile shows even on Blackout: it is the one thing the player
        // has always been allowed to find.
        this.paintMinimapPixel(ctx, run.player.x, run.player.y, px, bright);
    }

    /** One bright pixel at the maze cell's wall-grid tile of the minimap. */
    private paintMinimapPixel(
        ctx: CanvasRenderingContext2D,
        cellX: number,
        cellY: number,
        px: number,
        colour: string,
    ): void {
        ctx.fillStyle = colour;
        ctx.fillRect((2 * cellX + 1) * px, (2 * cellY + 1) * px, px, px);
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

    /**
     * Redraw the forecast's ghost walls: an incoming wall is the real wall
     * picture on the marks layer, breathing faint; an outgoing wall is its own
     * tile in the tiles layer, breathing just below full strength through the
     * `wall-outgoing` class. The class is cleared from every tile on each
     * update, so no wall keeps it after the change has happened.
     *
     * On a Blackout level the forecast never makes a hidden tile more visible:
     * `markTiles` gets the same view `syncTileVisibility` dims (through
     * `tileShown`), so a hidden wall gets no `wall-outgoing` breathing (whose
     * 0.8 to 0.9 opacity would override the hidden tile's 0.06 and reveal it)
     * and no incoming ghost picture either.
     */
    private syncMarks(run: Run): void {
        if (!this.marksLayer) return;
        for (const row of this.tileImages) {
            for (const image of row) image.classList.remove('wall-outgoing');
        }
        const forecast = run.forecast;
        if (!forecast) {
            this.marksLayer.replaceChildren();
            return;
        }
        const marks: HTMLElement[] = [];
        for (const mark of markTiles(forecast, run.maze.wallGrid, (tx, ty) => this.tileShown(tx, ty))) {
            if (mark.kind === 'open') {
                // The wall that will go away breathes on its own tile element.
                const tile = this.tileImages[mark.ty]?.[mark.tx];
                if (tile) tile.classList.add('wall-outgoing');
                continue;
            }
            // The wall that will appear: its real picture, faint and breathing.
            const image = document.createElement('img');
            image.className = 'mark mark-incoming';
            image.src = `${WALL_IMAGE_BASE}${mark.code}.png`;
            image.alt = '';
            image.style.left = `${mark.tx * this.cell}px`;
            image.style.top = `${mark.ty * this.cell}px`;
            image.style.width = `${this.cell}px`;
            image.style.height = `${this.cell}px`;
            marks.push(image);
        }
        // A stalker's intent (game/run.ts): a small chevron on the cell it means
        // to step to, pointing from the stalker toward that cell.
        for (const enemy of run.enemies) {
            if (enemy.kind !== 'stalker' || enemy.intent === null) continue;
            const dx = enemy.intent.x - enemy.x;
            const dy = enemy.intent.y - enemy.y;
            const dir = dx === 1 ? 'e' : dx === -1 ? 'w' : dy === 1 ? 's' : 'n';
            const element = document.createElement('div');
            element.className = `mark mark-intent mark-intent-${dir}`;
            element.style.left = `${(2 * enemy.intent.x + 1) * this.cell}px`;
            element.style.top = `${(2 * enemy.intent.y + 1) * this.cell}px`;
            element.style.width = `${this.cell}px`;
            element.style.height = `${this.cell}px`;
            marks.push(element);
        }
        this.marksLayer.replaceChildren(...marks);
    }
}

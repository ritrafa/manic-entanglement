import Player from './player';
import { Run } from '@/game/run';
import type { DeathCause, GameEvent } from '@/game/events';
import { eventMessage } from './shell';
import { Look, frameAt, sanitizeLook, spriteLayers } from '@/game/sprite';
import { boardLayout } from '@/game/layout';
import { clampDt } from '@/game/clock';
import { actionFor, dirOf } from '@/game/keys';
import { CONFIG } from '@/game/config';
import { Dir, Stepper } from '@/game/stepper';
import { Board } from './board';
import { defaultSave, loadSave, writeSave, type SaveData, type StorageLike } from '@/game/save';
import { hudModel, isNewBest, sameHudModel, type HudModel } from '@/game/hud';
import { Sound } from './sound';

const SPRITE_FRAME_MS = 150;
const BASE_PLAYBACK_RATE = 0.7;
const PLAYBACK_RATE_PER_LEVEL = 0.03;

class GameState {
    public run: Run;
    public player: Player;
    /** The best score kept in the save (save.best.descent), 0 when none was stored. */
    public highScore: number = 0;
    /** The one save object, loaded once from storage in the constructor. */
    private save: SaveData = defaultSave();
    /** window.localStorage where it works, null where storage is missing or throws. */
    private storage: StorageLike = null;
    /** Every sound the game makes: lazy elements, unlocked by the first gesture. */
    private audio: Sound = new Sound((src) => new Audio(src));
    private look: Look;
    /** The one code that touches the board's DOM: patched tiles and gliding sprites. */
    private board: Board = new Board();
    private preloadedUrls: Set<string> = new Set();
    private spriteInterval: ReturnType<typeof setInterval> | null = null;
    /** The one rAF handle while the frame loop runs; null when it is stopped. */
    private rafId: number | null = null;
    /** The movement cadence: held keys, the remembered press and when steps are due. */
    private stepper: Stepper = new Stepper();
    private lastTickAt: number = 0;
    /** The pending 3-2-1 timers while a countdown runs; null when no countdown is running. */
    private countdownTimers: ReturnType<typeof setTimeout>[] | null = null;
    /** Every timeout the shell scheduled, so dispose() can leave nothing that may fire. */
    private timeouts: Set<ReturnType<typeof setTimeout>> = new Set();
    /** The wall-grid tile size in whole pixels, set by sizeBoard and handed to the board. */
    private cellSize: number = 4;
    /** True while M has silenced every sound the shell owns. */
    private muted: boolean = false;
    /** The visible game-over panel, so confirm() can take it away on a restart. */
    private gameOverElement: HTMLElement | null = null;
    /** Every React listener waiting for the HUD model to change. */
    private hudListeners: Set<() => void> = new Set();
    /** The one model object React reads; replaced only when something actually changed. */
    private hudSnapshot: HudModel;
    /** The best score from before the current run, remembered at start() for isNewBest and the bar. */
    private bestBeforeRun: number = 0;

    constructor() {
        // The save is read once, here: private windows, blocked site data and the
        // server render all get null storage and a fresh default save instead.
        this.storage = GameState.readStorage();
        this.save = loadSave(this.storage);
        this.highScore = this.save.best.descent ?? 0;
        this.player = new Player();
        this.run = new Run({
            seed: Date.now(),
            stats: {
                attack: this.player.attack,
                defense: this.player.defense,
                speed: this.player.speed,
                consumption: this.player.consumption,
                storage: this.player.energy_storage,
            },
        });
        this.bestBeforeRun = this.highScore;
        this.hudSnapshot = hudModel(this.run, this.bestBeforeRun);
        // The saved mute choice applies before anything could play; the sound box
        // itself stays silent until the player's first gesture unlocks it.
        this.muted = this.save.settings.muted === true;
        this.audio.setMuted(this.muted);
        this.audio.setHidden(document.hidden);
        this.look = this.lookFromPlayer();
        this.preloadLook();
        this.mountBoard();
        this.spriteInterval = setInterval(() => this.refreshSprite(), SPRITE_FRAME_MS);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('blur', this.handleBlur);
        // The browser only lets sound start after a gesture: the first keydown,
        // pointerdown or touch anywhere unlocks the sound box. { once: true }
        // means the first one wins; unlock() itself is idempotent.
        for (const gesture of ['keydown', 'pointerdown', 'touchstart'] as const) {
            document.addEventListener(gesture, this.handleFirstGesture, { once: true });
        }
        // The player's glide lasts exactly one step, so CSS and Stepper cannot drift apart.
        document.documentElement.style.setProperty('--step-ms', `${CONFIG.stepMs}ms`);
    }

    /** True while the run accepts steps: the page uses it for the tap-to-start gesture. */
    get active(): boolean {
        return this.run.phase === 'playing' || this.run.phase === 'clear';
    }

    /** A hidden tab must not drain the run: ticking stops, and the measurement restarts on return. */
    private handleVisibilityChange = (): void => {
        this.audio.setHidden(document.hidden);
        if (!document.hidden) this.lastTickAt = performance.now();
    };

    /** The player's first keydown/pointerdown/touchstart: sound is allowed from now on. */
    private handleFirstGesture = (): void => {
        this.audio.unlock();
    };

    /** Losing the window mid-run must not leave a key stuck down. */
    private handleBlur = (): void => {
        this.stepper.clear();
    };

    /** Schedule a timeout the shell can still cancel after dispose(). */
    private after(ms: number, fn: () => void): void {
        const id = setTimeout(() => {
            this.timeouts.delete(id);
            fn();
        }, ms);
        this.timeouts.add(id);
    }

    /** The look starts from the Player's five trait fields, sanitized. */
    private lookFromPlayer(): Look {
        return sanitizeLook({
            Back: this.player.back,
            Body: this.player.body,
            Clothes: this.player.clothes,
            Eye: this.player.eye,
            Head: this.player.head,
        });
    }

    /** Replace the current look (e.g. after loading an NFT from the wallet). */
    setLook(look: unknown): void {
        this.look = sanitizeLook(look);
        this.preloadLook();
        this.refreshSprite();
    }

    /** Preload every frame of the current look once so the animation does not flicker. */
    private preloadLook(): void {
        for (let frame = 1; frame <= 4; frame++) {
            for (const url of spriteLayers(this.look, frame)) {
                if (!this.preloadedUrls.has(url)) {
                    this.preloadedUrls.add(url);
                    const image = new Image();
                    image.src = url;
                }
            }
        }
    }

    /** Build the board's layers once and draw the level that waits behind the title. */
    private mountBoard(): void {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        this.board.mount(mazeElement);
        this.sizeBoard(this.run.maze.width);
        this.board.setLevel(this.run, this.cellSize);
        this.refreshSprite();
    }

    /** Point the one persistent player element's layers at the frames for the current instant. */
    private refreshSprite(): void {
        this.board.setSprite(spriteLayers(this.look, frameAt(Date.now())));
    }

    /**
     * One keydown entry point: the pure mapping turns the event into an action,
     * any action the game owns gets preventDefault() so arrows and Space never
     * scroll the page. Browser chords and typing in fields are left alone.
     * The operating system's own repeat is ignored (`event.repeat`): the Stepper
     * sets the pace, not the OS.
     */
    handleKeyPress(event: KeyboardEvent): void {
        if (event.repeat) return;
        const target = event.target as Element | null;
        const action = actionFor({
            code: event.code,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            targetTag: typeof target?.tagName === 'string' ? target.tagName : undefined,
        });
        if (action === null) return;
        event.preventDefault();
        const dir = dirOf(action);
        if (dir) {
            // The frame loop turns the press into steps at the game's own cadence.
            if (this.active) this.stepper.press(action as Dir, performance.now());
            return;
        }
        if (action === 'confirm') {
            this.confirm();
        } else if (action === 'mute') {
            this.toggleMute();
        }
        // 'pause' is consumed here; the pause screen itself arrives in a later card.
    }

    /** The keyup partner of handleKeyPress: a released direction stops repeating. */
    handleKeyRelease(event: KeyboardEvent): void {
        const target = event.target as Element | null;
        const action = actionFor({
            code: event.code,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            targetTag: typeof target?.tagName === 'string' ? target.tagName : undefined,
        });
        if (action === null) return;
        if (dirOf(action)) this.stepper.release(action as Dir);
    }

    /**
     * One recognised swipe: a press followed straight by a release, so touches
     * share the keyboard's cadence (exactly one step, and a swipe pressed during
     * a wait is remembered like a tap).
     */
    tapMove(dx: number, dy: number): void {
        if (!this.active) return;
        const dir = GameState.dirName(dx, dy);
        if (dir === null) return;
        const now = performance.now();
        this.stepper.press(dir, now);
        this.stepper.release(dir);
    }

    /** The Stepper's name for a movement, or null when it is not one of the four. */
    private static dirName(dx: number, dy: number): Dir | null {
        if (dy === -1) return 'up';
        if (dy === 1) return 'down';
        if (dx === -1) return 'left';
        if (dx === 1) return 'right';
        return null;
    }

    /**
     * Enter, Space, the title image and the game-over panel all come through here:
     * the countdown starts from the title, a dead run restarts, and while the run
     * is live nothing happens.
     */
    confirm(): void {
        if (this.run.phase === 'dead') {
            this.clearGameOverPanel();
            this.beginRun();
            return;
        }
        this.startGame();
    }

    /** The browser's storage, or null where it is missing or refuses to be touched. */
    private static readStorage(): StorageLike {
        try {
            return window.localStorage;
        } catch {
            return null;
        }
    }

    /**
     * Fold a finished score into the save: when it beats the stored best, the best
     * is updated and written back, so it survives closing the tab.
     */
    private recordBest(score: number): void {
        if (score <= this.highScore) return;
        this.highScore = score;
        this.save = { ...this.save, best: { ...this.save.best, descent: score } };
        writeSave(this.storage, this.save);
    }

    /** M: every sound the shell owns goes quiet together, and back. */
    toggleMute(): void {
        this.setMuted(!this.muted);
    }

    /** Silence or unsilence the sound box and remember the choice in the save. */
    private setMuted(muted: boolean): void {
        this.muted = muted;
        this.audio.setMuted(muted);
        this.save = { ...this.save, settings: { ...this.save.settings, muted } };
        writeSave(this.storage, this.save);
    }

    /** One step: the run decides everything; the shell only turns its events into feedback. */
    movePlayer(dx: number, dy: number): void {
        this.run.move(dx, dy);
        this.handleEvents();
        this.board.update(this.run);
        this.publishHud();
    }

    startGame(): void {
        // One countdown at a time: a second request while one runs is ignored,
        // so the page never ends up with two countdown elements or two starts.
        if (this.countdownTimers !== null) return;
        if (this.run.phase !== 'ready' && this.run.phase !== 'dead') return;
        const mazeContainerElement = document.getElementById('maze-container');
        const titleElement = document.getElementById('title-screen');
        if (!titleElement) return;
        titleElement.style.opacity = '0.5';
        const countdownElement = document.createElement('p');
        countdownElement.className = 'title-screen-countdown';
        countdownElement.textContent = '3';
        mazeContainerElement?.appendChild(countdownElement);
        this.audio.play('beep');

        const timers: ReturnType<typeof setTimeout>[] = [];
        timers.push(setTimeout(() => {
            countdownElement.textContent = '2';
            this.audio.play('beep');
        }, 1000));

        timers.push(setTimeout(() => {
            countdownElement.textContent = '1';
            this.audio.play('beep');
        }, 2000));

        timers.push(setTimeout(() => {
            this.countdownTimers = null;
            countdownElement.remove();
            titleElement.style.display = 'none';
            this.beginRun();
        }, 3000));

        this.countdownTimers = timers;
    }

    /** Cancel a running countdown, leaving no timer behind. */
    private cancelCountdown(): void {
        if (this.countdownTimers === null) return;
        this.countdownTimers.forEach(clearTimeout);
        this.countdownTimers = null;
        document.querySelector('.title-screen-countdown')?.remove();
    }

    /** Start (or restart) the run at level 1 and set the clock going. */
    private beginRun(): void {
        this.stopClock();
        // The bar and the "new high score" claim measure this run against the best it started with.
        this.bestBeforeRun = this.highScore;
        this.run.start();
        this.handleEvents();
        this.publishHud();
        this.audio.startMusic();
        this.startClock();
    }

    /**
     * One requestAnimationFrame loop drives both the energy clock (with the real
     * elapsed time, clamped) and the movement cadence while the run is playing.
     */
    private startClock(): void {
        if (this.rafId !== null) return;
        this.lastTickAt = performance.now();
        const frame = () => {
            this.rafId = requestAnimationFrame(frame);
            const now = performance.now();
            // A throttled or suspended hidden tab must never hand the run one huge step.
            if (document.hidden) {
                this.lastTickAt = now;
                return;
            }
            if (this.run.phase !== 'playing') {
                this.stopClock();
                return;
            }
            const elapsedMs = clampDt(now - this.lastTickAt);
            this.lastTickAt = now;
            this.run.tick(elapsedMs);
            this.handleEvents();
            this.publishHud();
            const dir = this.stepper.poll(now);
            if (dir !== null) {
                const delta = dirOf(dir);
                if (delta) this.movePlayer(delta.dx, delta.dy);
            }
        };
        this.rafId = requestAnimationFrame(frame);
    }

    /** Stop the loop; leaving the playing phase forgets every held key. */
    private stopClock(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.stepper.clear();
    }

    /** Release everything the shell scheduled: after dispose() nothing it owns may fire. */
    dispose(): void {
        this.stopClock();
        this.cancelCountdown();
        if (this.spriteInterval !== null) {
            clearInterval(this.spriteInterval);
            this.spriteInterval = null;
        }
        this.timeouts.forEach(clearTimeout);
        this.timeouts.clear();
        this.hudListeners.clear();
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('blur', this.handleBlur);
        for (const gesture of ['keydown', 'pointerdown', 'touchstart'] as const) {
            document.removeEventListener(gesture, this.handleFirstGesture);
        }
        this.audio.stopAll();
    }

    /**
     * Subscribe to HUD model changes; the returned function unsubscribes.
     * A stable arrow-function field, so useSyncExternalStore never resubscribes.
     */
    public subscribe = (listener: () => void): (() => void) => {
        this.hudListeners.add(listener);
        return () => {
            this.hudListeners.delete(listener);
        };
    };

    /** The current model; the same object until something changes, so React can bail out. */
    public getSnapshot = (): HudModel => this.hudSnapshot;

    /** Recompute the model; replace the snapshot and wake the listeners only on a real change. */
    private publishHud(): void {
        const next = hudModel(this.run, this.bestBeforeRun);
        if (sameHudModel(this.hudSnapshot, next)) return;
        this.hudSnapshot = next;
        this.hudListeners.forEach((listener) => listener());
    }

    /** Turn the run's queued events into sound, drawing and messages, oldest first. */
    private handleEvents(): void {
        for (const event of this.run.takeEvents()) {
            switch (event.type) {
                case 'pickup':
                    this.audio.play('pickup');
                    this.floatMessage(event);
                    break;
                case 'fight':
                    this.audio.play('fight');
                    this.floatMessage(event);
                    break;
                case 'levelClear':
                    this.audio.play('levelup');
                    this.stopClock();
                    this.board.float(`+${event.gained}`, this.run.player.x, this.run.player.y);
                    this.recordBest(this.run.score);
                    this.triggerLevelCompleteAnimation(() => {
                        this.run.nextLevel();
                        this.handleEvents();
                        this.startClock();
                    });
                    break;
                case 'levelStart':
                    this.sizeBoard(event.size);
                    this.audio.setMusicRate(BASE_PLAYBACK_RATE + (event.level - 1) * PLAYBACK_RATE_PER_LEVEL);
                    this.board.setLevel(this.run, this.cellSize);
                    this.refreshSprite();
                    break;
                case 'dead':
                    this.stopClock();
                    this.recordBest(this.run.score);
                    this.gameOver(event.cause);
                    break;
            }
        }
        // A phase change (clear, dead, next level) is a HUD change too.
        this.publishHud();
    }

    /** Size the maze, the HUD and the CSS grid for a maze of the given cell side. */
    private sizeBoard(size: number): void {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        const tiles = size * 2 + 1;
        const { cell, board } = boardLayout(window.innerWidth, window.innerHeight, tiles);
        this.cellSize = cell;
        mazeElement.style.width = `${board}px`;
        mazeElement.style.height = `${board}px`;

        const hudElement = document.getElementById('hud');
        if (hudElement) hudElement.style.width = `${board}px`;

        document.documentElement.style.setProperty('--cell-size', `${cell}px`);
        document.documentElement.style.setProperty('--item-size', `${cell}px`);
        document.documentElement.style.setProperty('--grid-size', `${tiles}`);
    }

    /** Float the message an event carries above the cell it happened on, if any. */
    private floatMessage(event: GameEvent): void {
        const message = eventMessage(event);
        if (message === null) return;
        if (event.type === 'pickup' || event.type === 'fight') {
            this.board.float(message, event.x, event.y);
        }
    }

    triggerLevelCompleteAnimation(callback: { (): void; }) {
        const animationOverlay = document.getElementById('level-complete-animation');
        if(!animationOverlay) return;
        animationOverlay.style.opacity = '1';
        animationOverlay.style.transform = 'scale(20)';

        this.after(300, () => {
            animationOverlay.style.opacity = '0';
            animationOverlay.style.transform = 'scale(1)';
            this.after(100, callback); // Wait for the animation to complete before starting the new level
        });
    }

    gameOver(cause: DeathCause = 'time'): void {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        this.audio.stopMusic();
        this.audio.play('lost');
        mazeElement.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'; // Red overlay
        const score = this.run.score;
        const gameOverMessage = document.createElement('div');
        gameOverMessage.className = 'game-over-message';
        const gameOverMessageText = document.createElement('p');
        gameOverMessageText.textContent = `You lost -- but the game's not over!`;
        gameOverMessage.appendChild(gameOverMessageText);
        const gameOverMessageText2 = document.createElement('p');
        const reason = cause === 'fight' ? 'An enemy took your last energy' : 'You ran out of energy';
        gameOverMessageText2.textContent = `${reason}, but you scored ${score} points${isNewBest(score, this.bestBeforeRun) ? ' and set a new high score 🏆!' : '.'} Play again now that you are stronger.`;
        gameOverMessage.appendChild(gameOverMessageText2);
        mazeElement.appendChild(gameOverMessage);
        this.gameOverElement = gameOverMessage;

        gameOverMessage.addEventListener('click', () => this.confirm());
    }

    /** Take the game-over panel away again, leaving no red overlay behind. */
    private clearGameOverPanel(): void {
        this.gameOverElement?.remove();
        this.gameOverElement = null;
        const mazeElement = document.getElementById('maze');
        if (mazeElement) mazeElement.style.backgroundColor = '';
    }

    handleResize() {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        // Same sizing path as the level start, then every sprite follows the new cell size.
        this.sizeBoard(this.run.maze.width);
        this.board.resize(this.cellSize);
    }
}

export default GameState;

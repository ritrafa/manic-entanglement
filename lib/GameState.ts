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
import { nextScreen, sameSummary, summaryLines, type Screen, type ScreenAction, type SummaryLine } from '@/game/screens';
import { Sound } from './sound';

/**
 * The one snapshot React reads: every HUD field, plus the screen the shell is on
 * and, while "over", the end-of-run summary rows (null on every other screen).
 */
export interface GameSnapshot extends HudModel {
    /** The screen the shell is showing; drives the pause and game-over panels. */
    screen: Screen;
    /** The summary rows, built once when the run dies and shown on "over". */
    summary: SummaryLine[] | null;
}

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
    /** The screen the shell is showing; every change routes through nextScreen(). */
    private screen: Screen = 'title';
    /** The summary rows shown on "over"; null everywhere else. */
    private summary: SummaryLine[] | null = null;
    /** The screen the pause was taken from, so resuming knows where to go back to. */
    private pausedFrom: Screen = 'playing';
    /** The cause of the most recent death, kept for the summary. */
    private lastCause: DeathCause = 'time';
    /** True when the clear-screen animation finished while paused: the next level
     * turns over on resume, so the clock can never run behind the pause panel. */
    private pendingNextLevel: boolean = false;
    /** Every React listener waiting for the HUD model to change. */
    private hudListeners: Set<() => void> = new Set();
    /** The one model object React reads; replaced only when something actually changed. */
    private hudSnapshot: GameSnapshot;
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
        this.hudSnapshot = { ...hudModel(this.run, this.bestBeforeRun), screen: this.screen, summary: null };
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
        const running = this.run.phase === 'playing' || this.run.phase === 'clear';
        // A paused or dead run never accepts a step, whatever phase the Run is in.
        return running && this.screen !== 'paused' && this.screen !== 'over';
    }

    /**
     * A hidden tab must not drain the run: the 'hide' action pauses a live game
     * (clock stopped, music quiet), and returning to the tab never resumes by
     * itself — the player resumes through the panel. The clock measurement
     * restarts on return so a throttled tab never hands the run one huge step.
     */
    private handleVisibilityChange = (): void => {
        this.audio.setHidden(document.hidden);
        if (document.hidden) {
            this.dispatch('hide');
        } else {
            this.lastTickAt = performance.now();
        }
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
        } else if (action === 'pause') {
            this.dispatch('pause');
        }
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
     * Enter, Space, the title image and the panel's Retry button all come through
     * here: the countdown starts from the title, the summary restarts, a paused
     * game resumes, and while the run is live nothing happens. A focused button
     * keeps Enter/Space for itself (actionFor's targetTag rule), so the click and
     * this path can never both fire for one keypress.
     */
    confirm(): void {
        this.dispatch('confirm');
    }

    /** The pause panel's Resume: the same toggle Esc/P uses. */
    resume(): void {
        this.dispatch('pause');
    }

    /** The panel's Restart: abandon whatever is live and run the countdown again. */
    restart(): void {
        this.dispatch('restart');
    }

    /** The panel's Quit/Menu: abandon the run and go back to the title. */
    quit(): void {
        this.dispatch('quit');
    }

    /**
     * The one way the screen moves: the pure nextScreen decides where an action
     * leads, and the shell only acts on the change — pausing stops the clock and
     * quiets the music, quitting abandons the run, restarting starts a new one.
     */
    private dispatch(action: ScreenAction): void {
        const prev = this.screen;
        const next = nextScreen(prev, action, { pausedFrom: this.pausedFrom });
        if (next === prev) return;
        this.screen = next;

        if (next === 'paused') {
            this.pausedFrom = prev;
            this.enterPaused();
        } else if (prev === 'paused') {
            this.leavePaused(next);
        }

        if (next === 'countdown') {
            this.summary = null;
            // A restart abandons whatever run was live; from the title the
            // countdown starts one on its own. A refused start leaves no half
            // countdown behind.
            if (prev !== 'title') this.run.abandon();
            if (!this.startGame()) {
                this.screen = prev;
                return;
            }
        } else if (next === 'title') {
            this.quitToTitle();
        } else if (next === 'over') {
            this.audio.stopMusic();
            this.audio.play('lost');
            this.summary = summaryLines({
                tally: this.run.tally,
                score: this.run.score,
                best: this.bestBeforeRun,
                newBest: isNewBest(this.run.score, this.bestBeforeRun),
                cause: this.lastCause,
            });
        }
        this.publishHud();
    }

    /** Entering the pause: clock stopped, held keys forgotten, music quiet. */
    private enterPaused(): void {
        this.stopClock();
        this.audio.stopMusic();
    }

    /**
     * Leaving the pause: music and clock come back only for a live game, and a
     * level whose clear animation finished while paused turns over now — so the
     * clock never ran behind the panel.
     */
    private leavePaused(next: Screen): void {
        if (next !== 'playing' && next !== 'clear') return;
        this.audio.startMusic();
        if (this.pendingNextLevel) {
            this.pendingNextLevel = false;
            this.run.nextLevel();
            // The levelStart event routes the screen on to "playing".
            this.handleEvents();
        }
        if (this.screen === 'playing') this.startClock();
    }

    /** Quitting: the run is abandoned, the title stands ready again. */
    private quitToTitle(): void {
        this.cancelCountdown();
        this.stopClock();
        this.audio.stopMusic();
        this.pendingNextLevel = false;
        this.summary = null;
        this.run.abandon();
        const titleElement = document.getElementById('title-screen');
        if (titleElement) {
            titleElement.style.display = '';
            titleElement.style.opacity = '';
        }
        this.board.setLevel(this.run, this.cellSize);
        this.refreshSprite();
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

    /** The 3-2-1 countdown; true when it started, false when the request was refused. */
    startGame(): boolean {
        // One countdown at a time: a second request while one runs is ignored,
        // so the page never ends up with two countdown elements or two starts.
        if (this.countdownTimers !== null) return false;
        if (this.run.phase !== 'ready' && this.run.phase !== 'dead') return false;
        const mazeContainerElement = document.getElementById('maze-container');
        const titleElement = document.getElementById('title-screen');
        if (!titleElement) return false;
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
        return true;
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
        this.pendingNextLevel = false;
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
    public getSnapshot = (): GameSnapshot => this.hudSnapshot;

    /** Recompute the model; replace the snapshot and wake the listeners only on a real change. */
    private publishHud(): void {
        const next: GameSnapshot = {
            ...hudModel(this.run, this.bestBeforeRun),
            screen: this.screen,
            summary: this.summary,
        };
        if (sameHudModel(this.hudSnapshot, next)
            && this.hudSnapshot.screen === next.screen
            && sameSummary(this.hudSnapshot.summary, next.summary)) {
            return;
        }
        this.hudSnapshot = next;
        this.hudListeners.forEach((listener) => listener());
    }

    /** Turn the run's queued events into sound, drawing and messages, oldest first. */
    private handleEvents(): void {
        for (const event of this.run.takeEvents()) {
            switch (event.type) {
                case 'start':
                    // The countdown finished and the run is live.
                    this.dispatch('started');
                    break;
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
                    this.dispatch('cleared');
                    this.board.float(`+${event.gained}`, this.run.player.x, this.run.player.y);
                    this.recordBest(this.run.score);
                    this.triggerLevelCompleteAnimation(() => {
                        if (this.screen === 'paused') {
                            // The animation finished behind the pause panel: turn the
                            // level over on resume instead, so the clock never runs paused.
                            this.pendingNextLevel = true;
                            return;
                        }
                        this.run.nextLevel();
                        this.handleEvents();
                        this.startClock();
                    });
                    break;
                case 'levelStart':
                    this.dispatch('levelStarted');
                    this.sizeBoard(event.size);
                    this.audio.setMusicRate(BASE_PLAYBACK_RATE + (event.level - 1) * PLAYBACK_RATE_PER_LEVEL);
                    this.board.setLevel(this.run, this.cellSize);
                    this.refreshSprite();
                    break;
                case 'dead':
                    this.stopClock();
                    this.recordBest(this.run.score);
                    this.lastCause = event.cause;
                    this.dispatch('died');
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

    handleResize() {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        // Same sizing path as the level start, then every sprite follows the new cell size.
        this.sizeBoard(this.run.maze.width);
        this.board.resize(this.cellSize);
    }
}

export default GameState;

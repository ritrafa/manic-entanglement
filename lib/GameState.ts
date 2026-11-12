import { Run } from '@/game/run';
import type { DeathCause, GameEvent } from '@/game/events';
import { eventMessage } from './shell';
import { LAYER_ORDER, Look, frameAt, sanitizeLook, spriteLayers } from '@/game/sprite';
import { boardLayout } from '@/game/layout';
import { clampDt } from '@/game/clock';
import { actionFor, dirOf, rebind, DEFAULT_KEYS, type Action, type KeyMap } from '@/game/keys';
import { CONFIG, FX, MODIFIER_RULES } from '@/game/config';
import { ENEMY_KINDS } from '@/game/enemies';
import { FxLimiter, fxFor, hapticFor, lowEnergy, type Motion } from '@/game/fx';
import { Dir, Stepper } from '@/game/stepper';
import { Board } from './board';
import { defaultSave, loadSave, resetProgress, writeSave, type SaveData, type StorageLike } from '@/game/save';
import { countGear, noGear, sanitizeGear, type GearLevels } from '@/game/gear';
import { hudModel, isNewBest, sameHudModel, type HudModel } from '@/game/hud';
import { formatTenths, nextScreen, sameSummary, summaryLines, type Screen, type ScreenAction, type SummaryLine } from '@/game/screens';
import { MODES, betterScore, cycleMode, dailySeed, type ModeId, type ModeRules } from '@/game/modes';
import { announcement, resolveMotion, sanitizeSettings, type Settings } from '@/game/settings';
import { MODIFIER_INFO } from '@/game/modifiers';
import { evaluateFeats, featById, updateTotals } from '@/game/feats';
import { UNLOCKS, fitLook } from '@/game/wardrobe';
import { TOOL_IDS, type ToolId } from '@/game/tools';
import { Sequencer } from '@/game/audio/music';
import { AudioEngine } from './audioEngine';
import { beepVoices, sfxFor, warnVoices } from '@/game/audio/sfx';

/**
 * The one snapshot React reads: every HUD field, plus the screen the shell is on
 * and, while "over", the end-of-run summary rows (null on every other screen).
 */
export interface GameSnapshot extends HudModel {
    /** The screen the shell is showing; drives the pause and game-over panels. */
    screen: Screen;
    /** The summary rows, built once when the run dies and shown on "over". */
    summary: SummaryLine[] | null;
    /** The stored best for the current mode (save.best[mode]), 0 when none was kept. */
    best: number;
    /** True while the how-to was opened by the first Play: its button reads "Start". */
    howtoFromPlay: boolean;
    /** The player's settings, already sanitized; the settings screen edits these. */
    settings: Settings;
    /** The latest spoken announcement (game/settings.ts), shown by the live region. */
    announcement: string | null;
    /** Charges carried per tool (game/tools.ts); the ToolBar shows and spends them. */
    tools: Record<ToolId, number>;
    /** Successful moves the Anchor still freezes the maze for, 0 when not anchored. */
    anchored: number;
    /** The tool waiting for a direction (Cut), null when nothing is armed. */
    armed: ToolId | null;
    /** Pieces of gear carried since the last exit (game/gear.ts); the HUD marks them
     * while above 0: they are kept by reaching the exit and lost on death. */
    carried: number;
    /** The chosen way to play (game/modes.ts); the title's mode row edits it. */
    mode: ModeId;
    /** The mode's name and blurb, ready for the title's mode row. */
    modeName: string;
    modeBlurb: string;
    /** The mode's stored best already formatted: m:ss.t for a time mode, else a whole number. */
    modeBestText: string;
    /** True when the last run finished by clearing its last level, not by dying. */
    finished: boolean;
    /** The feat ids earned so far (game/feats.ts); the feats screen marks them. */
    feats: string[];
    /** The look the reptile wears now (game/sprite.ts); the wardrobe edits it. */
    look: Look;
}

/** True when two feat lists hold the same ids in the same order. */
function sameFeats(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** True when two looks wear the same trait on every layer. */
function sameLook(a: Look, b: Look): boolean {
    return (LAYER_ORDER as readonly string[]).every((layer) => a[layer as keyof Look] === b[layer as keyof Look]);
}

/** True when two tool charge records show the same counts. */
function sameTools(a: Record<ToolId, number>, b: Record<ToolId, number>): boolean {
    return TOOL_IDS.every((id) => a[id] === b[id]);
}

const SPRITE_FRAME_MS = 150;
/** Milliseconds between two music scheduling passes (~20 per second). */
const MUSIC_TICK_MS = 50;
/** Below this energy percentage the low-energy pulse starts. */
const LOW_ENERGY_PCT = 25;
/** Milliseconds between two low-energy pulses. */
const WARN_EVERY_MS = 1000;

class GameState {
    public run: Run;
    /** The best kept in the save for the current mode (save.best[mode]), 0 when none was stored. */
    public highScore: number = 0;
    /** The one save object, loaded once from storage in the constructor. */
    private save: SaveData = defaultSave();
    /** window.localStorage where it works, null where storage is missing or throws. */
    private storage: StorageLike = null;
    /** The synthesized sound: effects and the generated music, oscillators only. */
    private sfxEngine: AudioEngine = new AudioEngine(() => new AudioContext());
    /** The generative music, made on the first gesture and driven by a 50 ms timer. */
    private music: Sequencer | null = null;
    /** The interval that hands the engine the next music steps while playing. */
    private musicTimer: ReturnType<typeof setInterval> | null = null;
    /** Pickups taken since the level started; the pickup sound climbs with it. */
    private pickupStreak: number = 0;
    /** performance.now() of the last low-energy pulse, so it plays about once a second. */
    private lastWarnAt: number = 0;
    private look: Look;
    /** The one code that touches the board's DOM: patched tiles and gliding sprites. */
    private board: Board = new Board();
    /** The effects bus gate: at most three shakes and three flashes a second. */
    private fxLimiter: FxLimiter = new FxLimiter();
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
    /** The player's settings, sanitized from the save; every change re-applies them. */
    private settings: Settings = sanitizeSettings(undefined);
    /** True while the Controls screen waits for a key: the global handler stands down. */
    private capturingKey: boolean = false;
    /** The screen the shell is showing; every change routes through nextScreen(). */
    private screen: Screen = 'title';
    /** The summary rows shown on "over"; null everywhere else. */
    private summary: SummaryLine[] | null = null;
    /** The screen the pause was taken from, so resuming knows where to go back to. */
    private pausedFrom: Screen = 'playing';
    /** The screen the settings were opened from, so Back returns there. */
    private settingsFrom: Screen = 'title';
    /** The cause of the most recent death, kept for the summary. */
    private lastCause: DeathCause = 'time';
    /** Pieces of gear this run banked at exits, counted from "banked" events. */
    private runBanked: number = 0;
    /** Pieces of gear the last death lost, from the "dead" event. */
    private runLost: number = 0;
    /** True while the how-to was opened by the first Play: leaving it starts the run. */
    private howtoFromPlay: boolean = false;
    /** True when the clear-screen animation finished while paused: the next level
     * turns over on resume, so the clock can never run behind the pause panel. */
    private pendingNextLevel: boolean = false;
    /** Every React listener waiting for the HUD model to change. */
    private hudListeners: Set<() => void> = new Set();
    /** The one model object React reads; replaced only when something actually changed. */
    private hudSnapshot: GameSnapshot;
    /** The tool waiting for a direction: Cut arms on its key or button and the
     * next direction (key, swipe or D-pad) spends it; null when nothing waits. */
    private armedTool: ToolId | null = null;
    /** The best score from before the current run, remembered at start() for isNewBest and the bar. */
    private bestBeforeRun: number = 0;
    /** The chosen way to play (game/modes.ts); the title's mode row edits it. */
    private modeId: ModeId = 'descent';
    /** True once the live run emitted "finished"; decides the summary's wording. */
    private lastFinished: boolean = false;
    /** Names of the feats the last finished run earned; the summary prints them. */
    private lastFeatNames: string[] = [];
    /** "Layer Trait" texts the last run's new feats unlocked; the summary prints them. */
    private lastLookUnlocks: string[] = [];

    constructor() {
        // The save is read once, here: private windows, blocked site data and the
        // server render all get null storage and a fresh default save instead.
        this.storage = GameState.readStorage();
        this.save = loadSave(this.storage);
        // The mode is remembered in the save; anything unknown plays Descent.
        this.modeId = GameState.readModeSetting(this.save.settings);
        // A new calendar day wipes the stored Daily best before it is read.
        this.rollDailyDay();
        this.highScore = this.save.best[this.modeId] ?? 0;
        // The bank carries what earlier runs kept by reaching exits; anything
        // wrongly stored reads as no gear (game/gear.ts), and a no-gear mode
        // never sees the bank at all (game/modes.ts).
        this.run = new Run({ seed: this.seedForMode(), gear: this.gearForMode(), mode: this.modeRules });
        this.bestBeforeRun = this.highScore;
        // The look lives in the save; a fresh one is the default sprite, and a
        // saved look never wears a trait the earned feats do not unlock.
        this.look = fitLook(sanitizeLook(this.save.look), this.save.feats);
        this.hudSnapshot = { ...hudModel(this.run, this.hudBest()), screen: this.screen, summary: null, best: this.highScore, howtoFromPlay: false, settings: this.settings, announcement: null, tools: { ...this.run.tools }, anchored: this.run.anchored, armed: null, carried: countGear(this.run.carried), mode: this.modeId, modeName: this.modeRules.name, modeBlurb: this.modeRules.blurb, modeBestText: this.modeBestText(), finished: false, feats: [...this.save.feats], look: { ...this.look } };
        // The saved settings apply before anything could play; the sound box
        // itself stays silent until the player's first gesture unlocks it.
        this.settings = sanitizeSettings(this.save.settings);
        this.applySettings();
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
        return running && this.screen !== 'paused' && this.screen !== 'settings'
            && this.screen !== 'keys' && this.screen !== 'over';
    }

    /**
     * A hidden tab must not drain the run: the 'hide' action pauses a live game
     * (clock stopped, music quiet), and returning to the tab never resumes by
     * itself — the player resumes through the panel. The clock measurement
     * restarts on return so a throttled tab never hands the run one huge step.
     */
    private handleVisibilityChange = (): void => {
        if (document.hidden) {
            this.dispatch('hide');
        } else {
            this.lastTickAt = performance.now();
        }
        // A hidden tab stops the music; returning starts it again when live.
        this.syncMusic();
    };

    /** The player's first keydown/pointerdown/touchstart: sound is allowed from now on. */
    private handleFirstGesture = (): void => {
        this.sfxEngine.unlock();
        // The sequencer is born with the audio clock it schedules on.
        if (this.music === null) this.music = new Sequencer();
        this.syncMusic();
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

    /**
     * Replace the current look (e.g. after loading an NFT from the wallet). A
     * wallet look is worn as it is — not fitted to the earned feats — and is
     * never written to the save.
     */
    setLook(look: unknown): void {
        this.look = sanitizeLook(look);
        this.preloadLook();
        this.refreshSprite();
    }

    /**
     * The wardrobe's pick: the look goes through sanitizeLook and fitLook (a
     * trait the earned feats do not unlock falls back to its default), lands
     * in the save, and the sprite is redrawn at once.
     */
    setWardrobeLook(look: unknown): void {
        this.look = fitLook(sanitizeLook(look), this.save.feats);
        this.save = { ...this.save, look: { ...this.look } };
        writeSave(this.storage, this.save);
        this.preloadLook();
        this.refreshSprite();
        this.publishHud();
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
    mountBoard(): void {
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
        // While the Controls screen waits for a key, that screen owns the
        // keyboard alone: the game must not act on the key being bound.
        if (this.capturingKey) return;
        const target = event.target as Element | null;
        const action = actionFor({
            code: event.code,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            targetTag: typeof target?.tagName === 'string' ? target.tagName : undefined,
        }, this.keysMap);
        if (action === null) return;
        event.preventDefault();
        const dir = dirOf(action);
        if (dir) {
            // An armed Cut takes the next direction itself: it goes to the tool
            // instead of moving the player, and the tool disarms either way.
            if (this.armedTool !== null) {
                if (this.active) this.fireArmed(action as Dir);
                return;
            }
            // The frame loop turns the press into steps at the game's own cadence.
            if (this.active) this.stepper.press(action as Dir, performance.now());
            return;
        }
        if (action === 'confirm') {
            this.confirm();
        } else if (action === 'mute') {
            this.toggleMute();
        } else if (action === 'pause') {
            // Escape first cancels an armed tool; only then does it pause.
            if (this.armedTool !== null) {
                this.armedTool = null;
                this.publishHud();
                return;
            }
            this.dispatch('pause');
        } else if (action === 'tool1') {
            this.useTool('anchor');
        } else if (action === 'tool2') {
            this.useTool('twist');
        } else if (action === 'tool3') {
            this.useTool('cut');
        }
    }

    /** The keyup partner of handleKeyPress: a released direction stops repeating. */
    handleKeyRelease(event: KeyboardEvent): void {
        if (this.capturingKey) return;
        const target = event.target as Element | null;
        const action = actionFor({
            code: event.code,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            targetTag: typeof target?.tagName === 'string' ? target.tagName : undefined,
        }, this.keysMap);
        if (action === null) return;
        if (dirOf(action)) this.stepper.release(action as Dir);
    }

    /** The mapping in force: the player's saved one, ready for actionFor. */
    private get keysMap(): KeyMap {
        return this.settings.keys;
    }

    /**
     * The Controls screen asks for a key: from now until endKeyCapture() the
     * global keydown/keyup handler ignores every event, so the key being bound
     * never pauses, moves or mutes anything on the way.
     */
    beginKeyCapture(): void {
        this.capturingKey = true;
    }

    /** The Controls screen got its key (or cancelled): the game hears keys again. */
    endKeyCapture(): void {
        this.capturingKey = false;
    }

    /**
     * One Controls button was answered: the pure rebind swaps or replaces as
     * it must, the new map lands in the settings and the save at once, so the
     * rebinding works immediately and after a reload. A refused binding (Escape,
     * emptying an action) leaves the map — and the save — untouched.
     */
    setKey(action: Action, slot: 0 | 1, code: string): void {
        this.setSetting('keys', rebind(this.settings.keys, action, slot, code));
    }

    /** The Controls screen's Reset to defaults: every action back to its first binding. */
    resetKeys(): void {
        this.setSetting('keys', DEFAULT_KEYS);
    }

    /**
     * A touch began a held direction (or a D-pad button went down): the direction
     * joins the keyboard's cadence and keeps stepping while it stays down. The
     * TouchLayer and the D-pad are the only callers; they decide when a direction
     * is pressed and released, the Stepper decides when the steps fall.
     */
    pressDir(dir: Dir): void {
        if (!this.active) return;
        // An armed Cut takes the swipe or D-pad direction instead of moving.
        if (this.armedTool !== null) {
            this.fireArmed(dir);
            return;
        }
        this.stepper.press(dir, performance.now());
    }

    /** The touch left that direction (or the D-pad button came up): the run stops. */
    releaseDir(dir: Dir): void {
        this.stepper.release(dir);
    }

    /**
     * Enter, Space and the panel's Retry button all come through here: from the
     * title this follows the Play button's path (the how-to may show before the
     * countdown), the summary restarts, a paused game resumes, and while the run
     * is live nothing happens. A focused button keeps Enter/Space for itself
     * (actionFor's targetTag rule), so the click and this path can never both
     * fire for one keypress.
     */
    confirm(): void {
        // From the title, Enter follows the same path as the Play button (which
        // may show the how-to first); everywhere else it is the plain confirm.
        if (this.screen === 'title') {
            this.play();
            return;
        }
        this.dispatch('confirm');
    }

    /**
     * The menu's Play (and Enter on the title): the countdown starts, unless the
     * how-to has never been seen — then it shows first with its button reading
     * "Start", the flag is kept in the save, and confirming it runs the countdown.
     */
    play(): void {
        if (this.screen !== 'title') return;
        if (!this.save.seen.howto) {
            this.howtoFromPlay = true;
            this.save = { ...this.save, seen: { ...this.save.seen, howto: true } };
            writeSave(this.storage, this.save);
            this.dispatch('howto');
            return;
        }
        this.dispatch('confirm');
    }

    /** The menu's How to play, on request: the lines with their button reading "Back". */
    openHowTo(): void {
        if (this.screen !== 'title') return;
        this.howtoFromPlay = false;
        this.dispatch('howto');
    }

    /** The title menu's or the pause panel's Settings: opens the settings panel. */
    openSettings(): void {
        if (this.screen !== 'title' && this.screen !== 'paused') return;
        this.dispatch('settings');
    }

    /** The settings panel's Back button: Esc and the button both close it. */
    closeSettings(): void {
        this.dispatch('back');
    }

    /** The settings panel's Controls entry: opens the key rebinding screen. */
    openControls(): void {
        if (this.screen !== 'settings') return;
        this.dispatch('keys');
    }

    /** The Controls panel's Back button: Esc and the button both return to settings. */
    closeControls(): void {
        this.dispatch('back');
    }

    /** The pause panel's Resume: the same toggle Esc/P uses. */
    resume(): void {
        this.dispatch('pause');
    }

    /** The touch pause button: the same toggle Esc and P use. */
    togglePause(): void {
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
     * The title's mode row picked a way to play (game/modes.ts): only the title
     * may change it, the choice lands in `save.settings.mode` for the next
     * visit, and the title's board is rebuilt under the new rules at once.
     */
    setMode(id: ModeId): void {
        if (this.screen !== 'title') return;
        if (MODES[id] === undefined || id === this.modeId) return;
        this.modeId = id;
        this.save = { ...this.save, settings: { ...this.save.settings, mode: id } };
        writeSave(this.storage, this.save);
        this.rollDailyDay();
        this.highScore = this.storedBest() ?? 0;
        this.bestBeforeRun = this.highScore;
        // The title shows a run of the chosen mode's rules, ready for the countdown.
        this.run = new Run({ seed: this.seedForMode(), gear: this.gearForMode(), mode: this.modeRules });
        this.board.setLevel(this.run, this.cellSize);
        this.refreshSprite();
        this.publishHud();
    }

    /** The mode row's arrows: step to the next or previous mode, wrapping around. */
    stepMode(step: number): void {
        this.setMode(cycleMode(this.modeId, step));
    }

    /**
     * The one way the screen moves: the pure nextScreen decides where an action
     * leads, and the shell only acts on the change — pausing stops the clock and
     * quiets the music, quitting abandons the run, restarting starts a new one.
     */
    private dispatch(action: ScreenAction): void {
        const prev = this.screen;
        const next = nextScreen(prev, action, {
            pausedFrom: this.pausedFrom,
            howtoFromPlay: this.howtoFromPlay,
            settingsFrom: this.settingsFrom,
        });
        if (next === prev) return;
        this.screen = next;

        if (prev === 'howto') {
            // Closed once: a later visit is only ever on request.
            this.howtoFromPlay = false;
        }
        if (next === 'paused') {
            // Coming back from the settings panel keeps the original pause
            // origin: resuming a pause taken on the clear screen still waits
            // for the next level, whatever the settings visit did in between.
            if (prev !== 'settings') this.pausedFrom = prev;
            this.enterPaused();
        } else if (next === 'settings') {
            // Wherever it came from, the game stands still behind the panel:
            // clock stopped and music quiet, and Back returns to the caller.
            // Coming back from the Controls screen keeps the original origin:
            // the settings visit still ends where it started.
            if (prev !== 'keys') this.settingsFrom = prev;
            this.stopClock();
            this.syncMusic();
        } else if (prev === 'paused') {
            this.leavePaused(next);
        }

        if (next === 'countdown') {
            this.summary = null;
            this.lastFeatNames = [];
            this.lastLookUnlocks = [];
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
            this.syncMusic();
            // The run is over: its numbers join the lifetime totals, new feats
            // are earned once and written to the save, and their names join
            // the summary rows the panel shows.
            const settled = this.settleRun();
            this.lastFeatNames = settled.names;
            this.lastLookUnlocks = settled.unlocks;
            this.summary = summaryLines({
                tally: this.run.tally,
                score: this.run.score,
                best: this.bestBeforeRun,
                newBest: this.lastFinished
                    ? betterScore(this.modeId, this.run.tally.ms, this.bestBeforeRun > 0 ? this.bestBeforeRun : undefined)
                    : isNewBest(this.run.score, this.bestBeforeRun),
                cause: this.lastCause,
                banked: this.runBanked,
                lost: this.runLost,
                mode: this.modeId,
                finished: this.lastFinished,
                feats: this.lastFeatNames,
                unlocks: this.lastLookUnlocks,
            });
        }
        this.publishHud();
    }

    /** Entering the pause: clock stopped, held keys forgotten, music quiet. */
    private enterPaused(): void {
        this.stopClock();
        this.syncMusic();
    }

    /**
     * Leaving the pause: music and clock come back only for a live game, and a
     * level whose clear animation finished while paused turns over now — so the
     * clock never ran behind the panel.
     */
    private leavePaused(next: Screen): void {
        if (next !== 'playing' && next !== 'clear') return;
        this.syncMusic();
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
        this.syncMusic();
        this.pendingNextLevel = false;
        this.summary = null;
        this.howtoFromPlay = false;
        this.lastFinished = false;
        this.run.abandon();
        // The page shows the title again by itself: the title art belongs to
        // components/Menu.tsx, driven by the screen in the snapshot.
        this.board.setLevel(this.run, this.cellSize);
        this.refreshSprite();
    }

    /** The mode the save remembers; anything unknown plays Descent. */
    private static readModeSetting(settings: Record<string, unknown>): ModeId {
        const stored = settings.mode;
        return typeof stored === 'string' && MODES[stored as ModeId] !== undefined ? (stored as ModeId) : 'descent';
    }

    /** The rules the live run plays by (game/modes.ts). */
    private get modeRules(): ModeRules {
        return MODES[this.modeId] ?? MODES.descent;
    }

    /**
     * Today's local date as a yyyymmdd number. The shell is the only place a
     * Date is read: everything under game/ takes the date as an argument.
     */
    private static todayYyyymmdd(): number {
        const now = new Date();
        return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    }

    /** The run's seed: pinned to the calendar day for Daily, the wall clock otherwise. */
    private seedForMode(): number {
        return this.modeRules.seed === 'daily' ? dailySeed(GameState.todayYyyymmdd()) : Date.now();
    }

    /** The gear a new run starts with: the bank, or nothing in a no-gear mode. */
    private gearForMode(): GearLevels {
        return this.modeRules.gear ? sanitizeGear(this.save.gear) : noGear();
    }

    /**
     * A new calendar day retires the day's run: the stored Daily best is wiped
     * and `save.totals.dailyDay` remembers the current date. Called at load and
     * before every run, so a tab left open overnight starts a fresh Daily.
     */
    private rollDailyDay(): void {
        const today = GameState.todayYyyymmdd();
        if (this.save.totals.dailyDay === today) return;
        const best = { ...this.save.best };
        delete best.daily;
        this.save = { ...this.save, best, totals: { ...this.save.totals, dailyDay: today } };
        writeSave(this.storage, this.save);
    }

    /** The best stored for the current mode, undefined when this mode never had one. */
    private storedBest(): number | undefined {
        const stored = this.save.best[this.modeId];
        return typeof stored === 'number' && Number.isFinite(stored) ? stored : undefined;
    }

    /** The number the HUD bar measures against: 0 in a time mode, where bests are milliseconds. */
    private hudBest(): number {
        return this.modeRules.scoring === 'time' ? 0 : this.bestBeforeRun;
    }

    /** The mode's best as the title row prints it: m:ss.t for a time mode, else a whole number. */
    private modeBestText(): string {
        const best = this.storedBest();
        if (best === undefined) return '0';
        return this.modeRules.scoring === 'time' ? formatTenths(best) : String(Math.round(best));
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
     * Fold a finished result into the save, per mode (game/modes.ts): when it
     * beats the stored best by the mode's own rule (betterScore — higher score,
     * or lower time for Sprint), it is kept and written back, so it survives
     * closing the tab. Sprint bests are milliseconds, recorded only for runs
     * that actually finished.
     */
    private recordBest(value: number): void {
        if (!Number.isFinite(value)) return;
        if (!betterScore(this.modeId, value, this.storedBest())) return;
        this.highScore = value;
        this.save = { ...this.save, best: { ...this.save.best, [this.modeId]: value } };
        writeSave(this.storage, this.save);
    }

    /**
     * Settle a finished run into the save (game/feats.ts): the totals grow by
     * what the run did, the feats it earns on top of the ones already kept are
     * appended, and the save is written once. Returns the new feats' names, in
     * list order, for the summary. Called once per run, when the screen moves
     * to "over" — dying and finishing both land there.
     */
    private settleRun(): { names: string[]; unlocks: string[] } {
        const tally = this.run.tally;
        const totals = updateTotals(this.save.totals, tally);
        const freshIds = evaluateFeats(this.save.feats, tally, totals);
        this.save = { ...this.save, totals, feats: [...this.save.feats, ...freshIds] };
        writeSave(this.storage, this.save);
        return {
            names: freshIds.map((id) => featById(id)?.name ?? id),
            unlocks: freshIds.flatMap((id) => (UNLOCKS[id] ?? []).map((entry) => `${entry.layer} ${entry.trait}`)),
        };
    }

    /** The title menu's Feats entry: opens the list of feats and their state. */
    openFeats(): void {
        if (this.screen !== 'title') return;
        this.dispatch('feats');
    }

    /** The feats panel's Back button: Esc and the button both close it. */
    closeFeats(): void {
        this.dispatch('back');
    }

    /** The title menu's Wardrobe entry: opens the look picker. */
    openWardrobe(): void {
        if (this.screen !== 'title') return;
        this.dispatch('wardrobe');
    }

    /** The wardrobe panel's Back button: Esc and the button both close it. */
    closeWardrobe(): void {
        this.dispatch('back');
    }

    /** M: every sound the shell owns goes quiet together, and back. */
    toggleMute(): void {
        this.setSetting('muted', !this.settings.muted);
    }

    /**
     * One settings row changed (or M was pressed): the value goes through
     * sanitizeSettings so nothing invalid can stick, the whole object lands in
     * the save on every change, and the shell re-applies it at once — sound,
     * motion, contrast and text size all answer immediately.
     */
    setSetting(key: keyof Settings, value: unknown): void {
        this.settings = sanitizeSettings({ ...this.settings, [key]: value });
        this.save = { ...this.save, settings: { ...this.save.settings, ...this.settings } };
        writeSave(this.storage, this.save);
        this.applySettings();
        this.publishHud();
    }

    /** The settings as they stand now (the settings screen reads the snapshot). */
    getSettings(): Settings {
        return this.settings;
    }

    /**
     * The settings panel's Reset progress (asked twice before it lands): every
     * best, the gear bank, the lifetime totals and the feats return to their
     * defaults and are written back, while the settings, the look and the
     * seen messages stay. The live run keeps playing with an empty bank.
     */
    resetProgress(): void {
        this.save = resetProgress(this.save);
        writeSave(this.storage, this.save);
        this.highScore = 0;
        this.bestBeforeRun = 0;
        this.run.banked = noGear();
        this.run.carried = noGear();
        this.runBanked = 0;
        this.publishHud();
    }

    /**
     * Put the settings where they belong: the two bus volumes and the mute on
     * the engine, and data-motion, data-contrast and --ui-scale on the root
     * element, where styles/globals.css reads them for motion and contrast.
     */
    private applySettings(): void {
        this.sfxEngine.setVolume('sfx', this.settings.sfxVol);
        this.sfxEngine.setVolume('music', this.settings.musicVol);
        this.sfxEngine.setMuted(this.settings.muted);
        const root = document.documentElement;
        root.setAttribute('data-motion', resolveMotion(this.settings.motion, GameState.systemReduced()));
        root.setAttribute('data-contrast', this.settings.contrast ? 'true' : 'false');
        root.style.setProperty('--ui-scale', String(this.settings.textScale));
    }

    /** One step: the run decides everything; the shell only turns its events into feedback. */
    movePlayer(dx: number, dy: number): void {
        this.run.move(dx, dy);
        this.handleEvents();
        this.board.update(this.run);
        this.publishHud();
    }

    /**
     * Use one charge of a tool (game/tools.ts): the toolbar's tap and the tool1
     * and tool2 keys both come through here. The run decides (playing, a charge,
     * not already anchored); true when the use took effect. A successful use
     * re-draws the board — the forecast marks vanish under an Anchor and change
     * under a Twist — and wakes the HUD for the new charge count.
     */
    useTool(id: ToolId): boolean {
        if (id === 'cut') {
            // Cut needs a direction, so its key and button only arm it; a
            // second press while armed cancels. Arming is refused without a
            // charge (and outside a live, unanchored run).
            if (this.armedTool === 'cut') {
                this.armedTool = null;
                this.publishHud();
                return true;
            }
            if (this.run.phase !== 'playing') return false;
            if (this.run.anchored > 0) return false;
            if (this.run.tools.cut <= 0) return false;
            this.armedTool = 'cut';
            // A key held down from before must not step the player while armed.
            this.stepper.clear();
            this.publishHud();
            return true;
        }
        const used = this.run.useTool(id);
        if (!used) return false;
        this.handleEvents();
        this.board.update(this.run);
        this.publishHud();
        return true;
    }

    /**
     * The armed Cut got its direction (key, swipe or D-pad): the run decides,
     * and the tool disarms whether or not the use took effect. A successful
     * Cut re-draws the board — a wall opened behind the Knot — and the events
     * carry the gold flash for the opened tile.
     */
    private fireArmed(dir: Dir): void {
        const mazeDir = ({ up: 'u', right: 'r', down: 'd', left: 'l' } as const)[dir];
        this.run.useTool('cut', mazeDir);
        this.armedTool = null;
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
        // The title art stays on screen, dimmed by the page while the screen is
        // "countdown"; only the number is drawn here, over it.
        const countdownElement = document.createElement('p');
        countdownElement.className = 'game-countdown';
        countdownElement.textContent = '3';
        mazeContainerElement?.appendChild(countdownElement);
        this.sfxEngine.play(beepVoices(3), 'sfx');

        const timers: ReturnType<typeof setTimeout>[] = [];
        timers.push(setTimeout(() => {
            countdownElement.textContent = '2';
            this.sfxEngine.play(beepVoices(2), 'sfx');
        }, 1000));

        timers.push(setTimeout(() => {
            countdownElement.textContent = '1';
            this.sfxEngine.play(beepVoices(1), 'sfx');
        }, 2000));

        timers.push(setTimeout(() => {
            this.countdownTimers = null;
            countdownElement.remove();
            this.sfxEngine.play(beepVoices(0), 'sfx'); // the higher "go" beep
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
        document.querySelector('.game-countdown')?.remove();
    }

    /** Start (or restart) the run at level 1 and set the clock going. */
    private beginRun(): void {
        this.stopClock();
        this.pendingNextLevel = false;
        this.pickupStreak = 0;
        this.lastWarnAt = 0;
        this.lastFinished = false;
        // A tab left open overnight starts a fresh Daily: the old day's best is
        // retired before this run can be measured against it.
        this.rollDailyDay();
        // The run is built fresh under the chosen mode's rules: its own seed
        // (the calendar day for Daily) and its own gear (no bank without gear).
        this.run = new Run({ seed: this.seedForMode(), gear: this.gearForMode(), mode: this.modeRules });
        // The bar and the "new high score" claim measure this run against the best it started with.
        this.bestBeforeRun = this.storedBest() ?? 0;
        this.highScore = this.bestBeforeRun;
        this.run.start();
        this.handleEvents();
        this.publishHud();
        this.syncMusic();
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
            this.maybeWarnLowEnergy(now);
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
        this.armedTool = null;
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
        this.stopMusicTimer();
        if (this.music !== null) this.music.stop();
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
        // The music follows the run: every HUD change feeds it the depth and
        // the energy, so tempo and thinning track the game without timers.
        if (this.music !== null) {
            this.music.setState({ depth: this.run.level, energyPct: this.energyPct() / 100 });
        }
        // The board breathes the low-energy pulse while the run is live and
        // the energy sits under the warning line (game/fx.ts lowEnergy).
        this.board.setLowEnergy(this.run.phase === 'playing' && lowEnergy(this.energyPct() / 100));
        const model = hudModel(this.run, this.hudBest());
        // The moments that matter (game/settings.ts) speak once through the
        // HUD's polite live region; anything else keeps the last thing said.
        const said = announcement(this.hudSnapshot, { ...model, screen: this.screen });
        const next: GameSnapshot = {
            ...model,
            screen: this.screen,
            summary: this.summary,
            best: this.highScore,
            howtoFromPlay: this.howtoFromPlay,
            settings: this.settings,
            announcement: said ?? this.hudSnapshot.announcement,
            tools: { ...this.run.tools },
            anchored: this.run.anchored,
            armed: this.armedTool,
            carried: countGear(this.run.carried),
            mode: this.modeId,
            modeName: this.modeRules.name,
            modeBlurb: this.modeRules.blurb,
            modeBestText: this.modeBestText(),
            finished: this.lastFinished,
            feats: [...this.save.feats],
            look: { ...this.look },
        };
        if (sameHudModel(this.hudSnapshot, next)
            && this.hudSnapshot.screen === next.screen
            && sameSummary(this.hudSnapshot.summary, next.summary)
            && this.hudSnapshot.best === next.best
            && this.hudSnapshot.howtoFromPlay === next.howtoFromPlay
            && this.hudSnapshot.settings === next.settings
            && this.hudSnapshot.announcement === next.announcement
            && sameTools(this.hudSnapshot.tools, next.tools)
            && this.hudSnapshot.anchored === next.anchored
            && this.hudSnapshot.armed === next.armed
            && this.hudSnapshot.carried === next.carried
            && this.hudSnapshot.mode === next.mode
            && this.hudSnapshot.modeName === next.modeName
            && this.hudSnapshot.modeBlurb === next.modeBlurb
            && this.hudSnapshot.modeBestText === next.modeBestText
            && this.hudSnapshot.finished === next.finished
            && sameFeats(this.hudSnapshot.feats, next.feats)
            && sameLook(this.hudSnapshot.look, next.look)) {
            return;
        }
        this.hudSnapshot = next;
        this.hudListeners.forEach((listener) => listener());
    }

    /** Turn the run's queued events into sound, drawing and messages, oldest first. */
    private handleEvents(): void {
        for (const event of this.run.takeEvents()) {
            this.playEventSfx(event);
            this.playFx(event);
            this.vibrateFor(event);
            switch (event.type) {
                case 'start':
                    // The countdown finished and the run is live; its gear story
                    // (banked pieces and the final loss) starts from nothing.
                    this.runBanked = 0;
                    this.runLost = 0;
                    this.dispatch('started');
                    break;
                case 'banked':
                    // The exit kept what the level carried: the bank is the save now.
                    this.runBanked += event.count;
                    this.save = { ...this.save, gear: { ...this.run.banked } };
                    writeSave(this.storage, this.save);
                    break;
                case 'pickup':
                    // The sound just played rode the streak's degree; count it now.
                    this.pickupStreak += 1;
                    this.floatMessage(event);
                    break;
                case 'fight':
                    this.floatMessage(event);
                    break;
                case 'tool':
                    // A successful Cut names the wall it opened: a brief gold
                    // flash on that tile of the wall grid.
                    if (event.id === 'cut'
                        && typeof event.dx === 'number' && typeof event.dy === 'number') {
                        this.board.flashWallTile(this.run.player.x, this.run.player.y, event.dx, event.dy);
                    }
                    break;
                case 'levelClear':
                    this.stopClock();
                    this.dispatch('cleared');
                    this.board.float(`+${event.gained}`, this.run.player.x, this.run.player.y);
                    // Only score modes record at the exit; a time mode records
                    // its milliseconds once, when the run finishes.
                    if (this.modeRules.scoring === 'score') this.recordBest(this.run.score);
                    // The board pulls toward the exit for the zoom's length; the
                    // next level turns over when it is done. Reduced motion gets
                    // no zoom, so it waits not at all.
                    this.after(this.reducedMotion() ? 0 : FX.clearZoomMs, () => {
                        // The last level of a limited mode ended the run at the
                        // exit ("done"): there is no next level to turn over to.
                        if (this.run.phase !== 'clear') return;
                        if (this.screen === 'paused') {
                            // The zoom finished behind the pause panel: turn the
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
                    this.pickupStreak = 0;
                    this.dispatch('levelStarted');
                    this.sizeBoard(event.size);
                    this.board.setLevel(this.run, this.cellSize);
                    this.refreshSprite();
                    // The level the stalkers join (game/enemies.ts): the maze
                    // says so once, in its own words.
                    if (event.level === ENEMY_KINDS.stalker.fromDepth) {
                        this.board.float('Something is following you', this.run.player.x, this.run.player.y);
                    }
                    // An entangled level (game/modifiers.ts) announces itself:
                    // the twist's name and line stand over the board for two
                    // seconds as real text, and the live region says them too.
                    if (event.modifier !== null) {
                        const info = MODIFIER_INFO[event.modifier];
                        this.board.banner(info.name, info.line, MODIFIER_RULES.bannerMs);
                        this.hudSnapshot = {
                            ...this.hudSnapshot,
                            announcement: `${info.name}. ${info.line}`,
                        };
                    }
                    break;
                case 'dead':
                    this.stopClock();
                    // A time mode never records a death: only a finished run's
                    // milliseconds count (see the "finished" case).
                    if (this.modeRules.scoring === 'score') this.recordBest(this.run.score);
                    this.lastCause = event.cause;
                    this.runLost = event.lost;
                    this.dispatch('died');
                    break;
                case 'finished':
                    // The last level is down: the tally's time is the result.
                    this.stopClock();
                    this.lastFinished = true;
                    this.recordBest(this.run.tally.ms);
                    this.dispatch('finished');
                    break;
            }
        }
        // A phase change (clear, dead, next level) is a HUD change too.
        this.publishHud();
    }

    /** The energy as a percentage of storage, 0 to 100, for the sound context. */
    private energyPct(): number {
        const storage = this.run.stats.storage;
        if (!Number.isFinite(storage) || storage <= 0) return 0;
        const pct = (this.run.energy / storage) * 100;
        if (!Number.isFinite(pct)) return 0;
        return Math.min(100, Math.max(0, pct));
    }

    /**
     * One run event through the effects bus: game/fx.ts decides the effects,
     * the limiter keeps flashes and shakes under three a second, and the
     * board draws what survives. Effects never touch the rules or the score.
     */
    private playFx(event: GameEvent): void {
        const motion: Motion = resolveMotion(this.settings.motion, GameState.systemReduced());
        const now = GameState.nowMs();
        for (const fx of fxFor(event, { motion, exit: { ...this.run.exit } })) {
            // The shake switch off removes every shake, limiter or no limiter.
            if (fx.kind === 'shake' && !this.settings.shake) continue;
            if ((fx.kind === 'shake' || fx.kind === 'flash') && !this.fxLimiter.allow(fx.kind, now)) {
                continue;
            }
            this.board.play(fx);
        }
    }

    /**
     * The rumble one run event earns (game/fx.ts decides the length): only when
     * the player asked for haptics, the event asks for a rumble at all, and the
     * device actually has a vibrator.
     */
    private vibrateFor(event: GameEvent): void {
        if (!this.settings.haptics) return;
        const ms = hapticFor(event);
        if (ms <= 0) return;
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(ms);
        }
    }

    /** The browser's own reduced-motion ask, read fresh so a mid-run change is honoured. */
    private static systemReduced(): boolean {
        try {
            return typeof window !== 'undefined'
                && typeof window.matchMedia === 'function'
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch {
            return false;
        }
    }

    /** True when motion stands reduced now: the player's setting, or the system's ask. */
    private reducedMotion(): boolean {
        return resolveMotion(this.settings.motion, GameState.systemReduced()) === 'reduced';
    }

    /** A wall clock in milliseconds for the limiter's sliding window. */
    private static nowMs(): number {
        return typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
    }

    /** One run event through the sound design and the audio engine. */
    private playEventSfx(event: GameEvent): void {
        const voices = sfxFor(event, {
            streak: this.pickupStreak,
            energyPct: this.energyPct(),
            depth: this.run.level,
        });
        if (voices.length > 0) this.sfxEngine.play(voices, 'sfx');
    }

    /** While playing with low energy, a soft pulse about once a second. */
    private maybeWarnLowEnergy(now: number): void {
        if (this.run.phase !== 'playing' || this.screen !== 'playing') return;
        if (this.energyPct() >= LOW_ENERGY_PCT) {
            this.lastWarnAt = 0;
            return;
        }
        if (this.lastWarnAt !== 0 && now - this.lastWarnAt < WARN_EVERY_MS) return;
        this.lastWarnAt = now;
        this.sfxEngine.play(warnVoices(), 'sfx');
    }

    /**
     * Bring the music to the state the shell is in: while the screen is
     * playing or clear and the tab is visible, a 50 ms timer hands the engine
     * each step ahead of time; anywhere else the sequencer stands still.
     */
    private syncMusic(): void {
        const wantsMusic = (this.screen === 'playing' || this.screen === 'clear')
            && !document.hidden
            && this.music !== null;
        if (wantsMusic && this.musicTimer === null) {
            this.music?.start(this.sfxEngine.now());
            this.musicTimer = setInterval(() => this.tickMusic(), MUSIC_TICK_MS);
            this.tickMusic();
        } else if (!wantsMusic) {
            this.stopMusicTimer();
            if (this.music !== null) this.music.stop();
        }
    }

    /** One scheduling pass: every step due before the lookahead goes to the engine. */
    private tickMusic(): void {
        if (this.music === null) return;
        const now = this.sfxEngine.now();
        for (const scheduled of this.music.advance(now)) {
            if (scheduled.voices.length > 0) {
                this.sfxEngine.play(scheduled.voices, 'music', scheduled.time);
            }
        }
    }

    /** Silence the music timer; the sequencer itself keeps its place. */
    private stopMusicTimer(): void {
        if (this.musicTimer !== null) {
            clearInterval(this.musicTimer);
            this.musicTimer = null;
        }
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

    handleResize() {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        // Same sizing path as the level start, then every sprite follows the new cell size.
        this.sizeBoard(this.run.maze.width);
        this.board.resize(this.cellSize);
    }
}

export default GameState;

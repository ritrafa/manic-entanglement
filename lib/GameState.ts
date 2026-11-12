import Player from './player';
import { Run } from '@/game/run';
import type { DeathCause, GameEvent } from '@/game/events';
import { eventMessage } from './shell';
import { Look, frameAt, sanitizeLook, spriteLayers } from '@/game/sprite';
import { boardLayout } from '@/game/layout';
import { clampDt } from '@/game/clock';
import { actionFor, dirOf } from '@/game/keys';
import { Board } from './board';

const SPRITE_FRAME_MS = 150;
const CLOCK_TICK_MS = 50;
const BASE_PLAYBACK_RATE = 0.7;
const PLAYBACK_RATE_PER_LEVEL = 0.03;

class GameState {
    public run: Run;
    public player: Player;
    public highScore: number = 0;
    public sound: HTMLAudioElement;
    public lost: HTMLAudioElement;
    public levelup: HTMLAudioElement;
    public countdown: HTMLAudioElement;
    public pickupSound: HTMLAudioElement;
    public fightSound: HTMLAudioElement;
    private look: Look;
    /** The one code that touches the board's DOM: patched tiles and gliding sprites. */
    private board: Board = new Board();
    private preloadedUrls: Set<string> = new Set();
    private spriteInterval: ReturnType<typeof setInterval> | null = null;
    private clockInterval: ReturnType<typeof setInterval> | null = null;
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

    constructor() {
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
        this.sound = new Audio('/standoff-loop.mp3');
        this.sound.loop = true;
        this.sound.playbackRate = BASE_PLAYBACK_RATE;
        this.sound.play();
        this.lost = new Audio('/lost.mp3');
        this.levelup = new Audio('/levelup.wav');
        this.countdown = new Audio('/beep.mp3');
        this.countdown.playbackRate = 1.5;
        this.pickupSound = new Audio('/pickup.wav');
        this.pickupSound.playbackRate = 1;
        this.fightSound = new Audio('/fight.wav');
        this.fightSound.playbackRate = 2;
        this.look = this.lookFromPlayer();
        this.preloadLook();
        this.mountBoard();
        this.spriteInterval = setInterval(() => this.refreshSprite(), SPRITE_FRAME_MS);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    /** True while the run accepts steps: the page uses it for the tap-to-start gesture. */
    get active(): boolean {
        return this.run.phase === 'playing' || this.run.phase === 'clear';
    }

    /** A hidden tab must not drain the run: ticking stops, and the measurement restarts on return. */
    private handleVisibilityChange = (): void => {
        if (!document.hidden) this.lastTickAt = Date.now();
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
     */
    handleKeyPress(event: KeyboardEvent): void {
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
            if (this.active) this.movePlayer(dir.dx, dir.dy);
            return;
        }
        if (action === 'confirm') {
            this.confirm();
        } else if (action === 'mute') {
            this.toggleMute();
        }
        // 'pause' is consumed here; the pause screen itself arrives in a later card.
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

    /** M: every sound the shell owns goes quiet together, and back. */
    toggleMute(): void {
        this.muted = !this.muted;
        for (const audio of [this.sound, this.lost, this.levelup, this.countdown, this.pickupSound, this.fightSound]) {
            audio.muted = this.muted;
        }
    }

    /** One step: the run decides everything; the shell only turns its events into feedback. */
    movePlayer(dx: number, dy: number): void {
        this.run.move(dx, dy);
        this.handleEvents();
        this.board.update(this.run);
        this.updateStatus();
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
        this.countdown.play();

        const timers: ReturnType<typeof setTimeout>[] = [];
        timers.push(setTimeout(() => {
            countdownElement.textContent = '2';
            this.countdown.play();
        }, 1000));

        timers.push(setTimeout(() => {
            countdownElement.textContent = '1';
            this.countdown.play();
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
        this.run.start();
        this.handleEvents();
        this.sound.play();
        this.startClock();
    }

    /** One interval drives the energy clock with the real elapsed time. */
    private startClock(): void {
        if (this.clockInterval !== null) return;
        this.lastTickAt = Date.now();
        this.clockInterval = setInterval(() => {
            // A throttled or suspended hidden tab must never hand the run one huge step.
            if (document.hidden) return;
            const now = Date.now();
            const elapsedMs = clampDt(now - this.lastTickAt);
            this.lastTickAt = now;
            this.run.tick(elapsedMs);
            this.handleEvents();
            this.updateStatus();
            if (this.run.phase !== 'playing') this.stopClock();
        }, CLOCK_TICK_MS);
    }

    private stopClock(): void {
        if (this.clockInterval !== null) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }
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
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        [this.sound, this.lost, this.levelup, this.countdown, this.pickupSound, this.fightSound]
            .forEach((audio) => {
                audio.pause();
                audio.currentTime = 0;
            });
    }

    /** Turn the run's queued events into sound, drawing and messages, oldest first. */
    private handleEvents(): void {
        for (const event of this.run.takeEvents()) {
            switch (event.type) {
                case 'pickup':
                    this.pickupSound.play();
                    this.floatMessage(event);
                    break;
                case 'fight':
                    this.fightSound.play();
                    this.floatMessage(event);
                    break;
                case 'levelClear':
                    this.levelup.play();
                    this.stopClock();
                    this.highScore = Math.max(this.run.score, this.highScore);
                    this.triggerLevelCompleteAnimation(() => {
                        this.run.nextLevel();
                        this.handleEvents();
                        this.startClock();
                    });
                    break;
                case 'levelStart':
                    this.sizeBoard(event.size);
                    this.sound.playbackRate = BASE_PLAYBACK_RATE + (event.level - 1) * PLAYBACK_RATE_PER_LEVEL;
                    this.board.setLevel(this.run, this.cellSize);
                    this.refreshSprite();
                    this.updateStatus();
                    break;
                case 'dead':
                    this.stopClock();
                    this.highScore = Math.max(this.run.score, this.highScore);
                    this.gameOver(event.cause);
                    break;
            }
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

    updateStatus(): void {
        const run = this.run;
        const energyBar = document.getElementById('energy-bar-inner');
        if (energyBar) {
            energyBar.style.width = `${100 * run.energy / run.stats.storage}%`;
        }
        const progressBar = document.getElementById('progress-bar-inner');
        if (progressBar) {
            const progress = this.highScore > 0 ? Math.min((run.score / this.highScore) * 100, 100) : 0;
            progressBar.style.width = `${progress}%`;
        }

        const scoreElement = document.getElementById('stat-score');
        if (scoreElement) {
            scoreElement.textContent = `Score: ${run.score}`;
        }
        const energyElement = document.getElementById('stat-energy');
        if (energyElement) {
            energyElement.textContent = `Energy: ${Math.round(run.energy * 100) / 100}`;
        }
        const levelElement = document.getElementById('stat-level');
        if (levelElement) {
            levelElement.textContent = `${run.level}`;
        }
        const attackElement = document.getElementById('stat-attack');
        if (attackElement) {
            attackElement.textContent = `${Math.round(run.stats.attack * 10) / 10}`;
        }
        const defenseElement = document.getElementById('stat-defense');
        if (defenseElement) {
            defenseElement.textContent = `${Math.round(run.stats.defense * 10) / 10}`;
        }
        const speedElement = document.getElementById('stat-speed');
        if (speedElement) {
            speedElement.textContent = `${Math.round(run.stats.speed * 100)}%`;
        }
        const consumptionElement = document.getElementById('stat-consumption');
        if (consumptionElement) {
            consumptionElement.textContent = `${Math.round(run.stats.consumption * 100)}%`;
        }
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
        this.sound.pause();
        this.lost.play();
        mazeElement.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'; // Red overlay
        const score = this.run.score;
        const gameOverMessage = document.createElement('div');
        gameOverMessage.className = 'game-over-message';
        const gameOverMessageText = document.createElement('p');
        gameOverMessageText.textContent = `You lost -- but the game's not over!`;
        gameOverMessage.appendChild(gameOverMessageText);
        const gameOverMessageText2 = document.createElement('p');
        const reason = cause === 'fight' ? 'An enemy took your last energy' : 'You ran out of energy';
        gameOverMessageText2.textContent = `${reason}, but you scored ${score} points${score == this.highScore ? ' and set a new high score 🏆!' : '.'} Play again now that you are stronger.`;
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

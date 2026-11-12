// The browser shell around game/run.ts: it owns one Run, feeds it key presses and
// real elapsed time, and turns its events into drawing, sound and messages. No rules
// live here (the Run decides everything), no Math.random (the run owns randomness)
// and no module-level mutable state.

import Player from './player';
import { Run, type RunStats } from '@/game/run';
import type { GameEvent } from '@/game/events';
import { Look, frameAt, sanitizeLook, spriteLayers } from '@/game/sprite';

const SPRITE_FRAME_MS = 150;
const CLOCK_INTERVAL_MS = 50;
const BASE_PLAYBACK_RATE = 0.7;
const PLAYBACK_RATE_PER_LEVEL = 0.03;

/** The floating message text a run event shows, or null when it shows none. Pure. */
export function eventMessage(event: GameEvent): string | null {
    switch (event.type) {
        case 'pickup':
            return event.text;
        case 'fight':
            return `-${Math.round(event.cost * 100) / 100} Energy to Defeat`;
        default:
            return null;
    }
}

class GameState {
    public run: Run;
    public player: Player;
    public active: boolean;
    public sound: HTMLAudioElement;
    public lost: HTMLAudioElement;
    public levelup: HTMLAudioElement;
    public countdown: HTMLAudioElement;
    public pickup: HTMLAudioElement;
    public fight: HTMLAudioElement;
    private look: Look;
    private playerElement: HTMLElement | null = null;
    private layerImages: HTMLImageElement[] = [];
    private preloadedUrls: Set<string> = new Set();
    private spriteInterval: ReturnType<typeof setInterval> | null = null;
    private clockInterval: ReturnType<typeof setInterval> | null = null;
    private lastTickAt = 0;
    private highScore = 0;

    constructor() {
        this.player = new Player();
        this.run = new Run({ seed: Date.now(), stats: this.statsFromPlayer() });
        this.active = false;
        this.sound = new Audio('/standoff-loop.mp3');
        this.sound.loop = true;
        this.sound.playbackRate = BASE_PLAYBACK_RATE;
        this.sound.play();
        this.lost = new Audio('/lost.mp3');
        this.levelup = new Audio('/levelup.wav');
        this.countdown = new Audio('/beep.mp3');
        this.countdown.playbackRate = 1.5;
        this.pickup = new Audio('/pickup.wav');
        this.pickup.playbackRate = 1;
        this.fight = new Audio('/fight.wav');
        this.fight.playbackRate = 2;
        this.look = this.lookFromPlayer();
        this.preloadLook();
        this.spriteInterval = setInterval(() => this.refreshSprite(), SPRITE_FRAME_MS);
    }

    /** The run's stats come from the Player's own numbers (NFT-loaded or default). */
    private statsFromPlayer(): RunStats {
        return {
            attack: this.player.attack,
            defense: this.player.defense,
            speed: this.player.speed,
            consumption: this.player.consumption,
            storage: this.player.energy_storage,
        };
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

    /** Build the stacked layer images of the player element at the current frame. */
    private attachSprite(playerElement: HTMLElement): void {
        this.playerElement = playerElement;
        this.layerImages = [];
        for (const url of spriteLayers(this.look, frameAt(Date.now()))) {
            const layerImage = document.createElement('img');
            layerImage.className = 'player-layer';
            layerImage.src = url;
            layerImage.alt = '';
            playerElement.appendChild(layerImage);
            this.layerImages.push(layerImage);
        }
    }

    /** Point the current player element's layers at the frames for the current instant. */
    private refreshSprite(): void {
        if (!this.playerElement) return;
        const urls = spriteLayers(this.look, frameAt(Date.now()));
        if (urls.length !== this.layerImages.length) {
            // The look changed while the element existed: rebuild the stack.
            this.layerImages.forEach((image) => image.remove());
            this.attachSprite(this.playerElement);
            return;
        }
        urls.forEach((url, index) => {
            const image = this.layerImages[index];
            if (image.getAttribute('src') !== url) image.setAttribute('src', url);
        });
    }

    /** The 3-2-1 countdown, then the run starts. Keys do nothing until then. */
    startGame() {
        if (this.active) return;
        this.active = true;
        const mazeContainerElement = document.getElementById('maze-container');
        const titleElement = document.getElementById('title-screen');
        if (!titleElement) return;
        titleElement.style.opacity = '0.5';
        const countdownElement = document.createElement('p');
        countdownElement.className = 'title-screen-countdown';
        countdownElement.textContent = '3';
        mazeContainerElement?.appendChild(countdownElement);
        this.countdown.play();

        setTimeout(() => {
            countdownElement.textContent = '2';
            this.countdown.play();
        }, 1000);

        setTimeout(() => {
            countdownElement.textContent = '1';
            this.countdown.play();
        }, 2000);

        setTimeout(() => {
            countdownElement.remove();
            titleElement.style.display = 'none';
            this.beginRun();
        }, 3000);
    }

    /** Start (or restart) the run at level 1 and set the clock going. */
    private beginRun(): void {
        this.active = true;
        this.run.start();
        this.sound.play();
        this.handleEvents();
        this.startClock();
    }

    handleKeyPress(event: KeyboardEvent): void {
        switch (event.key) {
            case 'ArrowUp':
            case 'w':
                this.movePlayer(0, -1);
                break;
            case 'ArrowRight':
            case 'd':
                this.movePlayer(1, 0);
                break;
            case 'ArrowDown':
            case 's':
                this.movePlayer(0, 1);
                break;
            case 'ArrowLeft':
            case 'a':
                this.movePlayer(-1, 0);
                break;
        }
    }

    movePlayer(dx: number, dy: number): void {
        this.run.move(dx, dy);
        this.handleEvents();
        this.updateStatus();
    }

    // --- the clock ---------------------------------------------------------

    /** One interval feeds the run the real elapsed time; it stops when not playing. */
    private startClock(): void {
        if (this.clockInterval !== null) return;
        this.lastTickAt = Date.now();
        this.clockInterval = setInterval(() => this.onClockTick(), CLOCK_INTERVAL_MS);
    }

    private stopClock(): void {
        if (this.clockInterval === null) return;
        clearInterval(this.clockInterval);
        this.clockInterval = null;
    }

    private onClockTick(): void {
        const now = Date.now();
        const elapsedMs = now - this.lastTickAt;
        this.lastTickAt = now;
        this.run.tick(elapsedMs);
        this.handleEvents();
        this.updateStatus();
        if (this.run.phase !== 'playing') this.stopClock();
    }

    // --- events -------------------------------------------------------------

    /** Drain the run's events in order and react to each one. */
    private handleEvents(): void {
        let boardChanged = false;
        for (const event of this.run.takeEvents()) {
            switch (event.type) {
                case 'pickup':
                    this.pickup.play();
                    this.floatMessage(event);
                    boardChanged = true;
                    break;
                case 'fight':
                    this.fight.play();
                    this.floatMessage(event);
                    boardChanged = true;
                    break;
                case 'levelClear':
                    this.levelup.play();
                    this.stopClock();
                    this.triggerLevelCompleteAnimation(() => {
                        this.run.nextLevel();
                        this.handleEvents();
                        this.startClock();
                    });
                    break;
                case 'levelStart':
                    this.sizeBoard(event.size);
                    this.renderMaze();
                    this.updateStatus();
                    this.sound.playbackRate = BASE_PLAYBACK_RATE + PLAYBACK_RATE_PER_LEVEL * (event.level - 1);
                    break;
                case 'dead':
                    this.stopClock();
                    this.active = false;
                    this.highScore = Math.max(this.highScore, event.score);
                    this.gameOver(event.score); // draws the panel over the current board
                    boardChanged = false;
                    break;
                case 'move':
                    boardChanged = true;
                    break;
                default:
                    // start and blocked need no reaction beyond the redraw below.
                    break;
            }
        }
        if (boardChanged) this.renderMaze();
    }

    /** Float the event's message above the player, if it has one. */
    private floatMessage(event: GameEvent): void {
        const message = eventMessage(event);
        if (message) setTimeout(() => this.displayMessage(message), 0);
    }

    displayMessage(message: string): void {
        const playerElement = document.querySelector('.player');
        if (!playerElement) return;

        const messageElement = document.createElement('div');

        messageElement.className = 'message';
        messageElement.textContent = message;
        playerElement.parentElement?.appendChild(messageElement);

        // Remove the message after the animation completes
        setTimeout(() => {
            messageElement.remove();
        }, 2500);
    }

    triggerLevelCompleteAnimation(callback: { (): void; }) {
        const animationOverlay = document.getElementById('level-complete-animation');
        if(!animationOverlay) return;
        animationOverlay.style.opacity = '1';
        animationOverlay.style.transform = 'scale(20)';
    
        setTimeout(() => {
            animationOverlay.style.opacity = '0';
            animationOverlay.style.transform = 'scale(1)';
            setTimeout(callback, 100); // Wait for the animation to complete before starting the new level
        }, 300);
    }

    // --- drawing ------------------------------------------------------------

    /** Size the maze and HUD elements and the CSS grid variables for a board of `size`. */
    private sizeBoard(size: number): void {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        const containerSize = window.innerWidth < window.innerHeight ? window.innerWidth * 0.9 : window.innerHeight * 0.7;
        mazeElement.style.width = `${containerSize}px`;
        mazeElement.style.height = `${containerSize}px`;

        const hudElement = document.getElementById('hud');
        if (hudElement) hudElement.style.width = `${containerSize}px`;

        const cellSize = Math.floor(containerSize / (size * 2 + 1));
        document.documentElement.style.setProperty('--cell-size', `${cellSize}px`);
        document.documentElement.style.setProperty('--item-size', `${cellSize}px`);
        document.documentElement.style.setProperty('--grid-size', `${size * 2 + 1}`);
    }

    renderMaze(): void {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        mazeElement.innerHTML = '';
        this.playerElement = null;
        this.layerImages = [];

        for (let y = 0; y < this.run.maze.height * 2 + 1; y++) {
            for (let x = 0; x < this.run.maze.width * 2 + 1; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';

                const wallImage = document.createElement('img');
                wallImage.src = `images/${this.run.maze.wallGrid[y][x]}.png`;
                wallImage.className = 'wall-image';
                cell.appendChild(wallImage);

                // Add player, exit, powerups, and enemies
                if (y % 2 === 1 && x % 2 === 1) {
                    const cellX = (x - 1) / 2;
                    const cellY = (y - 1) / 2;
                    if (cellX === this.run.player.x && cellY === this.run.player.y) {
                        const playerElement = document.createElement('div');
                        playerElement.className = `player${this.run.player.facingLeft ? ' flip-horizontal' : ''}`;
                        this.attachSprite(playerElement);
                        cell.appendChild(playerElement);
                    } else if (cellX === this.run.exit.x && cellY === this.run.exit.y) {
                        const exitElement = document.createElement('div');
                        exitElement.className = 'exit';
                        cell.appendChild(exitElement);
                    } else {
                        const powerup = this.run.items.find(p => p.x === cellX && p.y === cellY);
                        if (powerup) {
                            const powerupElement = document.createElement('div');
                            powerupElement.className = `powerup item_${powerup.type}`;
                            cell.appendChild(powerupElement);
                        }
                        const enemy = this.run.enemies.find(p => p.x === cellX && p.y === cellY);
                        if (enemy) {
                            const enemyElement = document.createElement('div');
                            enemyElement.className = `enemy`;
                            cell.appendChild(enemyElement);
                        }
                    }
                }

                mazeElement.appendChild(cell);
            }
        }
        // Add the overlay
        this.addOverlay(this.run.maze.origin.x * 2 + 1, this.run.maze.origin.y * 2 + 1);
    }

    /** Draw the fade overlay centred on the given wall-grid tile. */
    private addOverlay(x: number, y: number): void {
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

    updateStatus(): void {
        const energyBar = document.getElementById('energy-bar-inner');
        if (energyBar) {
            energyBar.style.width = `${100 * this.run.energy / this.run.stats.storage}%`;
        }
        const progressBar = document.getElementById('progress-bar-inner');
        if (progressBar) {
            const progress = this.highScore > 0 ? Math.min((this.run.score / this.highScore) * 100, 100) : 0;
            progressBar.style.width = `${progress}%`;
        }

        const scoreElement = document.getElementById('stat-score');
        if (scoreElement) {
            scoreElement.textContent = `Score: ${this.run.score}`;
        }
        const energyElement = document.getElementById('stat-energy');
        if (energyElement) {
            energyElement.textContent = `Energy: ${Math.round(this.run.energy * 100) / 100}`;
        }
        const levelElement = document.getElementById('stat-level');
        if (levelElement) {
            levelElement.textContent = `${this.run.level}`;
        }
        const attackElement = document.getElementById('stat-attack');
        if (attackElement) {
            attackElement.textContent = `${Math.round(this.run.stats.attack*10)/10}`;
        }
        const defenseElement = document.getElementById('stat-defense');
        if (defenseElement) {
            defenseElement.textContent = `${Math.round(this.run.stats.defense*10)/10}`;
        }
        const speedElement = document.getElementById('stat-speed');
        if (speedElement) {
            speedElement.textContent = `${Math.round(this.run.stats.speed * 100)}%`;
        }
        const consumptionElement = document.getElementById('stat-consumption');
        if (consumptionElement) {
            consumptionElement.textContent = `${Math.round(this.run.stats.consumption * 100)}%`;
        }
    }

    // --- screens ------------------------------------------------------------

    gameOver(score: number): void {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        this.sound.pause();
        this.lost.play();
        mazeElement.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'; // Red overlay
        const gameOverMessage = document.createElement('div');
        gameOverMessage.className = 'game-over-message';
        const gameOverMessageText = document.createElement('p');
        gameOverMessageText.textContent = `You lost -- but the game's not over!`;
        gameOverMessage.appendChild(gameOverMessageText);
        const gameOverMessageText2 = document.createElement('p');
        gameOverMessageText2.textContent = `You ran out of energy, but you scored ${score} points${score == this.highScore ? ' and set a new high score 🏆!' : '.'} Play again now that you are stronger.`;
        gameOverMessage.appendChild(gameOverMessageText2);
        mazeElement.appendChild(gameOverMessage);

        gameOverMessage.addEventListener('click', () => {
            gameOverMessage.remove();
            this.beginRun();
        });
    }

    handleResize() {
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        const containerSize = window.innerWidth < window.innerHeight ? window.innerWidth * 0.9 : window.innerHeight * 0.7;
        mazeElement.style.width = `${containerSize}px`;
        mazeElement.style.height = `${containerSize}px`;

        const hudElement = document.getElementById('hud');
        if (!hudElement) return;
        hudElement.style.width = `${containerSize}px`;
    
        const cellSize = containerSize / (this.run.maze.width * 2 + 1);
        document.documentElement.style.setProperty('--cell-size', `${cellSize}px`);
        document.documentElement.style.setProperty('--item-size', `${cellSize}px`);
        document.documentElement.style.setProperty('--grid-size', `${this.run.maze.width * 2 + 1}`);
    }
}

export default GameState;

import Player from './player';
import { Run } from '@/game/run';
import type { GameEvent } from '@/game/events';
import { eventMessage } from './shell';
import { Look, frameAt, sanitizeLook, spriteLayers } from '@/game/sprite';

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
    private playerElement: HTMLElement | null = null;
    private layerImages: HTMLImageElement[] = [];
    private preloadedUrls: Set<string> = new Set();
    private spriteInterval: ReturnType<typeof setInterval> | null = null;
    private clockInterval: ReturnType<typeof setInterval> | null = null;
    private lastTickAt: number = 0;
    private starting: boolean = false;

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
        this.spriteInterval = setInterval(() => this.refreshSprite(), SPRITE_FRAME_MS);
    }

    /** True while the run accepts steps: the page uses it for the tap-to-start gesture. */
    get active(): boolean {
        return this.run.phase === 'playing';
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

    /** One step: the run decides everything; the shell only turns its events into feedback. */
    movePlayer(dx: number, dy: number): void {
        this.run.move(dx, dy);
        this.handleEvents();
        this.renderMaze();
        this.updateStatus();
    }

    startGame(): void {
        if (this.starting) return;
        if (this.run.phase !== 'ready' && this.run.phase !== 'dead') return;
        const mazeContainerElement = document.getElementById('maze-container');
        const titleElement = document.getElementById('title-screen');
        if (!titleElement) return;
        this.starting = true;
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
            this.starting = false;
            this.beginRun();
        }, 3000);
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
            const now = Date.now();
            const elapsedMs = now - this.lastTickAt;
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
                    this.renderMaze();
                    this.updateStatus();
                    break;
                case 'dead':
                    this.stopClock();
                    this.highScore = Math.max(this.run.score, this.highScore);
                    this.gameOver();
                    break;
            }
        }
    }

    /** Size the maze and HUD elements and the CSS grid for a board of the given side. */
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

        const run = this.run;

        for (let y = 0; y < run.maze.height * 2 + 1; y++) {
            for (let x = 0; x < run.maze.width * 2 + 1; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';

                const wallImage = document.createElement('img');
                wallImage.src = `images/${run.maze.wallGrid[y][x]}.png`;
                wallImage.className = 'wall-image';
                cell.appendChild(wallImage);

                // Add player, exit, items, and enemies
                if (y % 2 === 1 && x % 2 === 1) {
                    const cellX = (x - 1) / 2;
                    const cellY = (y - 1) / 2;
                    if (cellX === run.player.x && cellY === run.player.y) {
                        const playerElement = document.createElement('div');
                        playerElement.className = `player${run.player.facingLeft ? ' flip-horizontal' : ''}`;
                        this.attachSprite(playerElement);
                        cell.appendChild(playerElement);
                    } else if (cellX === run.exit.x && cellY === run.exit.y) {
                        const exitElement = document.createElement('div');
                        exitElement.className = 'exit';
                        cell.appendChild(exitElement);
                    } else {
                        const item = run.items.find((p) => p.x === cellX && p.y === cellY);
                        if (item) {
                            const itemElement = document.createElement('div');
                            itemElement.className = `powerup item_${item.type}`;
                            cell.appendChild(itemElement);
                        }
                        const enemy = run.enemies.find((p) => p.x === cellX && p.y === cellY);
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
        this.addOverlay(run.maze.origin.x * 2 + 1, run.maze.origin.y * 2 + 1);
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

    /** Float the message an event carries above the player, if any. */
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

    gameOver(): void {
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
        gameOverMessageText2.textContent = `You ran out of energy, but you scored ${score} points${score == this.highScore ? ' and set a new high score 🏆!' : '.'} Play again now that you are stronger.`;
        gameOverMessage.appendChild(gameOverMessageText2);
        mazeElement.appendChild(gameOverMessage);

        gameOverMessage.addEventListener('click', () => {
            gameOverMessage.remove();
            mazeElement.style.backgroundColor = '';
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

        const cellSize = this.run.maze.width * 2 + 1;
        document.documentElement.style.setProperty('--cell-size', `${Math.floor(containerSize / cellSize)}px`);
        document.documentElement.style.setProperty('--item-size', `${Math.floor(containerSize / cellSize)}px`);
        document.documentElement.style.setProperty('--grid-size', `${cellSize}`);
    }
}

export default GameState;

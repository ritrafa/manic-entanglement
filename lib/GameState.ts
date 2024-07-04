import Player from './player';
import Maze, { Cell, Item, Enemy } from './maze';

const INITIAL_MAZE_SIZE = 7;
const INITIAL_MAZE_LEVEL = 1;
const POWERUP_COUNT = [2, 5];
const ENEMY_COUNT = [1, 3];
const SHUFFLE_COUNT = 15;
let energyInterval: NodeJS.Timeout;
//const SOUND = {pickup: new Audio('pickup.wav'), background: new Audio('standoff-loop.mp3'), fight: new Audio('fight.wav'), playbackRate: 0.7};

class GameState {
    public maze: Maze;
    public player: Player;
    public powerups: { x: number, y: number, type: string }[];
    public enemies: { x: number, y: number }[];
    public exit: { x: number, y: number };
    public active: boolean;
    public sound: HTMLAudioElement;
    public lost: HTMLAudioElement;

    constructor() {
        console.log('constructor');
        this.maze = new Maze(INITIAL_MAZE_SIZE, INITIAL_MAZE_SIZE);
        this.player = new Player();
        this.player.maze_level = 1;
        this.player.energy = 100;
        this.player.points = 0;
        this.player.high_score = 0;
        this.powerups = [];
        this.enemies = [];
        this.exit = { x: 0, y: 0 };
        this.active = false;
        this.sound = new Audio('/standoff-loop.mp3');
        this.sound.loop = true;
        this.sound.playbackRate = 0.7;
        this.sound.play();
        this.lost = new Audio('/lost.mp3');
    }

    initGame(size: number = INITIAL_MAZE_SIZE): Player {
        this.active = true;
        this.sound.play();
        this.maze = new Maze(size, size);

        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return this.player;
        const containerSize = window.innerWidth < window.innerHeight ? window.innerWidth * 0.9 : window.innerHeight * 0.7;
        mazeElement.style.width = `${containerSize}px`;
        mazeElement.style.height = `${containerSize}px`;

        const hudElement = document.getElementById('hud');
        if (!hudElement) return this.player;
        hudElement.style.width = `${containerSize}px`;
    
        const cellSize = Math.floor(containerSize / (size * 2 + 1));
        document.documentElement.style.setProperty('--cell-size', `${cellSize}px`);
        document.documentElement.style.setProperty('--item-size', `${cellSize}px`);
        document.documentElement.style.setProperty('--grid-size', `${size * 2 + 1}`);


        this.player.x = Math.floor(this.maze.width / 2);
        this.player.y = this.maze.height - 1;
        this.player.energy = Math.max(100, this.player.energy_storage);
        this.exit = { x: Math.floor(this.maze.width / 2), y: 0 };

        this.placePowerups();
        this.placeEnemies();
        this.renderMaze();
        this.updateStatus();

        // Start the background music
        //SOUND.background.playbackRate = SOUND.playbackRate;
        //SOUND.background.loop = true;
        //SOUND.background.play();
        

        clearInterval(energyInterval);
        energyInterval = setInterval(() => {
            this.player.energy--;
            this.updateStatus();
            if (this.player.energy <= 0) {
                clearInterval(energyInterval);
                this.player.high_score = Math.max(this.player.points, this.player.high_score);
                this.gameOver();
                this.player.points = 0;
                this.player.maze_level = 1;
                this.sound.playbackRate = 0.7;
            }
        }, this.player.speed * 250);

        return this.player;
    }

    placePowerups(): void {
        console.log('placePowerups');
        const itemTypes = ['energy', 'boots', 'gloves', 'shield', 'speed', 'backpack'];
        this.powerups = [];
        const powerupCount = Math.floor(Math.random() * (POWERUP_COUNT[1] - POWERUP_COUNT[0] + 1)) + POWERUP_COUNT[0];
        for (let i = 0; i < powerupCount; i++) {
            let x: number, y: number;
            let itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
            do {
                x = Math.floor(Math.random() * this.maze.width);
                y = Math.floor(Math.random() * this.maze.height);
            } while ((x === this.player.x && y === this.exit.y) || (x === this.exit.x && y === this.exit.y) || this.powerups.some(p => p.x === x && p.y === y));
            this.powerups.push({ x, y, type: itemType });
        }
    }

    placeEnemies(): void {
        console.log('placeEnemies');
        this.enemies = [];
        const enemyCount = Math.floor(Math.random() * (ENEMY_COUNT[1] - ENEMY_COUNT[0] + 1)) + ENEMY_COUNT[0];
        for (let i = 0; i < enemyCount; i++) {
            let x: number, y: number;
            do {
                x = Math.floor(Math.random() * this.maze.width);
                y = Math.floor(Math.random() * this.maze.height);
            } while ((x === this.player.x && y === this.player.y) || (x === this.exit.x && y === this.exit.y) || this.powerups.some(p => p.x === x && p.y === y) || this.enemies.some(p => p.x === x && p.y === y));
            this.enemies.push({ x, y });
        }
    }

    renderMaze(): void {
        console.log('renderMaze');
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        mazeElement.innerHTML = '';

        for (let y = 0; y < this.maze.height * 2 + 1; y++) {
            for (let x = 0; x < this.maze.width * 2 + 1; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';

                const wallImage = document.createElement('img');
                wallImage.src = `images/${this.maze.wallGrid[y][x]}.png`;
                wallImage.className = 'wall-image';
                cell.appendChild(wallImage);

                // Add player, exit, powerups, and enemies
                if (y % 2 === 1 && x % 2 === 1) {
                    const cellX = (x - 1) / 2;
                    const cellY = (y - 1) / 2;
                    if (cellX === this.player.x && cellY === this.player.y) {
                        const playerElement = document.createElement('div');
                        playerElement.className = `player${this.player.facing_left ? ' flip-horizontal' : ''}`;
                        cell.appendChild(playerElement);
                    } else if (cellX === this.exit.x && cellY === this.exit.y) {
                        const exitElement = document.createElement('div');
                        exitElement.className = 'exit';
                        cell.appendChild(exitElement);
                    } else {
                        const powerup = this.powerups.find(p => p.x === cellX && p.y === cellY);
                        if (powerup) {
                            const powerupElement = document.createElement('div');
                            powerupElement.className = `powerup item_${powerup.type}`;
                            cell.appendChild(powerupElement);
                        }
                        const enemy = this.enemies.find(p => p.x === cellX && p.y === cellY);
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
        this.maze.addOverlay(this.maze.origin.x * 2 + 1, this.maze.origin.y * 2 + 1);
    }

    updateStatus(): void {
        console.log('status')
        const energyBar = document.getElementById('energy-bar-inner');
        if (energyBar) {
            energyBar.style.width = `${100 * this.player.energy / this.player.energy_storage}%`;
        }
        const progressBar = document.getElementById('progress-bar-inner');
        if (progressBar) {
            const progress = Math.min((this.player.points / this.player.high_score) * 100, 100);
            progressBar.style.width = `${progress}%`;
        }

        const scoreElement = document.getElementById('stat-score');
        if (scoreElement) {
            scoreElement.textContent = `Score: ${this.player.points}`;
        }
        const energyElement = document.getElementById('stat-energy');
        if (energyElement) {
            energyElement.textContent = `Energy: ${Math.round(this.player.energy * 100) / 100}`;
        }
        /*
        const highScoreElement = document.getElementById('high-score');
        if (highScoreElement) {
            highScoreElement.textContent = `High Score: ${this.player.high_score}`;
        }
        */
        const levelElement = document.getElementById('stat-level');
        if (levelElement) {
            levelElement.textContent = `${this.player.maze_level}`;
        }
        const attackElement = document.getElementById('stat-attack');
        if (attackElement) {
            attackElement.textContent = `${this.player.attack}`;
        }
        const defenseElement = document.getElementById('stat-defense');
        if (defenseElement) {
            defenseElement.textContent = `${this.player.defense}`;
        }
        const speedElement = document.getElementById('stat-speed');
        if (speedElement) {
            speedElement.textContent = `${Math.round(this.player.speed * 100)}%`;
        }
        const consumptionElement = document.getElementById('stat-consumption');
        if (consumptionElement) {
            consumptionElement.textContent = `${Math.round(this.player.energy_usage * 100)}%`;
        }
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
        let message = '';
        const newX = this.player.x + dx;
        const newY = this.player.y + dy;

        if (newX >= 0 && newX < this.maze.width && newY >= 0 && newY < this.maze.height && this.player.energy > 0) {
            if ((dx === -1 && !this.maze.grid[this.player.y][this.player.x].walls[3]) ||
                (dx === 1 && !this.maze.grid[this.player.y][this.player.x].walls[1]) ||
                (dy === -1 && !this.maze.grid[this.player.y][this.player.x].walls[0]) ||
                (dy === 1 && !this.maze.grid[this.player.y][this.player.x].walls[2])) {

                if (dx === -1) {
                    this.player.facing_left = true;
                } else if (dx === 1) {
                    this.player.facing_left = false;
                }

                this.player.x = newX;
                this.player.y = newY;
                this.player.energy -= 1 * this.player.energy_usage;
                this.player.points++;

                for (let i = 0; i < SHUFFLE_COUNT; i++) {
                    this.maze.shiftMaze();
                }

                const powerupIndex = this.powerups.findIndex(p => p.x === this.player.x && p.y === this.player.y);
                if (powerupIndex !== -1) {
                    const item = new Item(this.powerups[powerupIndex].type);
                    message = item.useItem(this.player);
                    this.powerups.splice(powerupIndex, 1);
                }
                const enemiesIndex = this.enemies.findIndex(p => p.x === this.player.x && p.y === this.player.y);
                if (enemiesIndex !== -1) {
                    const enemy = new Enemy();
                    message = enemy.attackEnemy(this.player);
                    this.enemies.splice(enemiesIndex, 1);
                }

                this.renderMaze();
                this.updateStatus();

                if (message) {
                    setTimeout(() => this.displayMessage(this.player, message), 0);
                }

                if (this.player.x === this.exit.x && this.player.y === this.exit.y) {
                    this.triggerLevelCompleteAnimation(() => {
                        this.player.high_score = Math.max(this.player.points, this.player.high_score);
                        this.player.maze_level += 1
                        this.initGame(this.maze.width + 2);
                        this.sound.playbackRate += 0.03;
                    });
                    return;
                }

                if (this.player.energy <= 0) {
                    clearInterval(energyInterval);
                    this.player.high_score = Math.max(this.player.points, this.player.high_score);
                    this.gameOver();
                    this.player.points = 0;
                    this.player.maze_level = 1;
                    this.sound.playbackRate = 0.7;
                    return;
                }
            }
        }
    }

    displayMessage(player: Player, message: string): void {
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

    startGame() {
        const titleElement = document.getElementById('title-screen');
        if (!titleElement) return;
        titleElement.style.display = 'none';
        this.initGame(INITIAL_MAZE_SIZE);
    }


    gameOver(): void {
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
        gameOverMessageText2.textContent = `You ran out of energy, but you scored ${this.player.points} points${this.player.points == this.player.high_score ? ' and set a new high score 🏆!' : '.'} Play again now that you are stronger.`;
        gameOverMessage.appendChild(gameOverMessageText2);
        mazeElement.appendChild(gameOverMessage);

        gameOverMessage.addEventListener('click', () => {
            gameOverMessage.remove();
            this.initGame(INITIAL_MAZE_SIZE);
        });
    }

    handleResize() {
        console.log('handleResize');
        const mazeElement = document.getElementById('maze');
        if (!mazeElement) return;
        const containerSize = window.innerWidth < window.innerHeight ? window.innerWidth * 0.9 : window.innerHeight * 0.7;
        mazeElement.style.width = `${containerSize}px`;
        mazeElement.style.height = `${containerSize}px`;

        const hudElement = document.getElementById('hud');
        if (!hudElement) return this.player;
        hudElement.style.width = `${containerSize}px`;
    
        const cellSize = containerSize / (this.maze.width * 2 + 1);
        document.documentElement.style.setProperty('--cell-size', `${cellSize}px`);
        document.documentElement.style.setProperty('--item-size', `${cellSize}px`);
        document.documentElement.style.setProperty('--grid-size', `${this.maze.width * 2 + 1}`);
    }
}

export default GameState;
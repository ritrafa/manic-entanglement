export default class Player {
    energy: number;
    points: number;
    high_score: number;
    x: number;
    y: number;
    energy_usage: number;
    facing_left: boolean;
    energy_storage: number;
    attack: number;
    defense: number;
    speed: number;

    constructor() {
        this.energy = 100;
        this.points = 0;
        this.high_score = 0;
        this.x = 0;
        this.y = 0;
        this.energy_usage = 1;
        this.facing_left = false;
        this.energy_storage = 100;
        this.attack = 1;
        this.defense = 1;
        this.speed = 1;
    }
}

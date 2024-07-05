export default class Player {
    energy: number;
    points: number;
    high_score: number;
    x: number;
    y: number;
    consumption: number;
    facing_left: boolean;
    energy_storage: number;
    attack: number;
    defense: number;
    speed: number;
    maze_level: number;
    head: string;
    eye: string;
    clothes: string;
    body: string;
    back: string;
  
    constructor() {
      this.energy = 100;
      this.maze_level = 1;
      this.points = 0;
      this.high_score = 0;
      this.x = 0;
      this.y = 0;
      this.consumption = 1;
      this.facing_left = false;
      this.energy_storage = 100;
      this.attack = 1;
      this.defense = 1;
      this.speed = 1;
      this.head = 'None';
      this.eye = 'Regular';
      this.clothes = 'None';
      this.body = 'Green';
      this.back = 'None'
    }
  
    setPlayerDetails(details: { key: string; value: any }[]) {
      details.forEach(detail => {
        const keyRewrite = detail.key.toLowerCase;

        switch (detail.key) {
          case 'Head':
            this.head = detail.value;
            break;
          case 'Eye':
            this.eye = detail.value;
            break;
          case 'Clothes':
            this.clothes = detail.value;
            break;
          case 'Body':
            this.body = detail.value;
            break;
          case 'Back':
            this.back = detail.value;
            break;
          case 'High Score':
            this.high_score = parseFloat(detail.value);
            break;
          case 'Attack':
            this.attack = parseFloat(detail.value);
            break;
          case 'Defense':
            this.defense = parseFloat(detail.value);
            break;
          case 'Speed':
            this.speed = parseFloat(detail.value);
            break;
          case 'Consumption':
            this.consumption = parseFloat(detail.value);
            break;
          case 'Energy Storage':
            this.energy_storage = parseFloat(detail.value);
            break;
          default:
            console.warn(`Unknown key: ${detail.key}`);
        }
      });
    }
  }
  
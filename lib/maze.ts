import Player from './player';

class Item {
    type: string;
    sound: HTMLAudioElement;

    constructor(type: string) {
        this.type = type;
        this.sound = new Audio('/pickup.wav');
        this.sound.playbackRate = 1;
    }

    useItem(player: Player): string {
        this.sound.play();
        let message = '';
        switch (this.type) {
            case 'energy':
                player.energy = Math.min(player.energy_storage, player.energy + 25);
                message = '+25 Energy';
                break;
            case 'boots':
                player.consumption *= 0.99;
                message = '-1% Energy Use';
                break;
            case 'gloves':
                player.attack += 0.1;
                message = '+0.1 Attack';
                break;
            case 'shield':
                player.defense += 0.1;
                message = '+0.1 Defense';
                break;
            case 'speed':
                player.speed *= 1.01;
                message = '+1% Speed';
                break;
            case 'backpack':
                player.energy_storage += 5;
                player.energy += 5;
                message = '+5 Energy Storage';
                break;
        }
        return message;
    }
}

class Enemy {
    attack: number;
    energy: number;
    sound: HTMLAudioElement;

    constructor() {
        this.attack = 10;
        this.energy = 10;
        this.sound = new Audio('/fight.wav');
        this.sound.playbackRate = 2;
    }

    attackEnemy(player: Player): string {
        this.sound.play();
        let message = '';

        let energyCost = this.energy / player.attack * (this.attack - player.defense);
        player.energy -= energyCost;
        message = `-${Math.round(energyCost * 100) / 100} Energy to Defeat`;

        return message;
    }
}

export { Item, Enemy };

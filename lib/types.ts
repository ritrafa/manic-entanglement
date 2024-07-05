// types.ts
export interface Player {
    energy: number;
    points: number;
    maze_level: number;
    high_score: number;
    energy_storage: number;
    consumption: number;
    attack: number;
    defense: number;
    speed: number;
    x: number;
    y: number;
    facing_left: boolean;
    head: string;
    body: string;
    eye: string;
    clothes: string;
    back: string;
    setPlayerDetails(details: { key: string; value: any }[]): void;
}

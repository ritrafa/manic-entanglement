// Every sound the game makes runs through one Sound object: one lazily created
// element per sample, nothing played before the player's first gesture unlocks
// it, and a rejected or thrown play() that never escapes. The element factory
// comes in through the constructor, so this file never reaches for a browser
// global itself and its tests run in plain node.

/** The small part of an HTML audio element this module uses. */
export interface AudioLike {
    play(): Promise<void> | void;
    pause(): void;
    currentTime: number;
    loop: boolean;
    playbackRate: number;
    volume: number;
    muted: boolean;
}

/** Builds the element for one sample url; the shell passes its own audio maker. */
export type AudioFactory = (src: string) => AudioLike;

/** The one-shot samples the game plays, each with its url and fixed rate. */
export type SoundName = 'pickup' | 'fight' | 'levelup' | 'beep' | 'lost';

interface Sample {
    src: string;
    playbackRate: number;
}

const SAMPLES: Record<SoundName, Sample> = {
    pickup: { src: '/pickup.wav', playbackRate: 1 },
    fight: { src: '/fight.wav', playbackRate: 2 },
    levelup: { src: '/levelup.wav', playbackRate: 1 },
    beep: { src: '/beep.mp3', playbackRate: 1.5 },
    lost: { src: '/lost.mp3', playbackRate: 1 },
};

/** The looping music track, played at a rate the shell sets per level. */
const MUSIC_SRC = '/standoff-loop.mp3';

/**
 * The game's one sound box. Elements are made lazily through the injected
 * factory on first use, so constructing a Sound creates nothing; play() and
 * the music stay silent until unlock() says the player has gestured.
 */
export class Sound {
    private readonly factory: AudioFactory;
    /** The one element per sample, made on first use. */
    private elements: Partial<Record<SoundName, AudioLike>> = {};
    /** The one music element, made the first time the music should actually play. */
    private musicElement: AudioLike | null = null;
    /** False until the player's first gesture; nothing plays before it. */
    private allowed = false;
    private isMuted = false;
    private isHidden = false;
    /** True between startMusic() and stopMusic(): the music wants to play. */
    private musicWanted = false;
    /** True while the music element is actually playing, so pause happens once. */
    private musicPlaying = false;
    /** The music's speed, remembered so a late-created element still gets it. */
    private musicRate = 1;

    constructor(factory: AudioFactory) {
        this.factory = factory;
    }

    /** The player's first gesture: play is allowed from now on, pending music starts. */
    unlock(): void {
        if (this.allowed) return;
        this.allowed = true;
        this.refreshMusic();
    }

    /** Rewind and play the one element of a sample; a rejection or throw stays swallowed. */
    play(name: SoundName): void {
        if (!this.allowed || this.isMuted) return;
        this.start(this.element(name));
    }

    /** The music should be playing; it starts at once when allowed, visible and unmuted. */
    startMusic(): void {
        this.musicWanted = true;
        this.refreshMusic();
    }

    /** The music goes quiet and stays quiet until the next startMusic(). */
    stopMusic(): void {
        this.musicWanted = false;
        this.refreshMusic();
    }

    /** The music's speed (0.7 at level 1, a little faster per level). */
    setMusicRate(rate: number): void {
        this.musicRate = rate;
        if (this.musicElement !== null) this.musicElement.playbackRate = rate;
    }

    /** M: everything goes quiet; unmuting brings the music back when it should play. */
    setMuted(muted: boolean): void {
        if (this.isMuted === muted) return;
        this.isMuted = muted;
        this.refreshMusic();
    }

    /** Whether M (or the save) has the game silent. */
    get muted(): boolean {
        return this.isMuted;
    }

    /** A hidden tab pauses the music; returning resumes it when it was playing. */
    setHidden(hidden: boolean): void {
        if (this.isHidden === hidden) return;
        this.isHidden = hidden;
        this.refreshMusic();
    }

    /** Silence and rewind everything the Sound owns; used when the shell goes away. */
    stopAll(): void {
        this.musicWanted = false;
        this.musicPlaying = false;
        for (const element of this.allElements()) {
            element.pause();
            element.currentTime = 0;
        }
    }

    /** Bring the music to the state the flags ask for: playing, or paused. */
    private refreshMusic(): void {
        if (this.shouldPlayMusic()) {
            // The element is made here and only here, so a hidden or muted game
            // never constructs one it would not play.
            this.start(this.music());
            this.musicPlaying = true;
        } else if (this.musicPlaying && this.musicElement !== null) {
            this.musicElement.pause();
            this.musicPlaying = false;
        }
    }

    private shouldPlayMusic(): boolean {
        return this.allowed && this.musicWanted && !this.isHidden && !this.isMuted;
    }

    /** Rewind and play, swallowing both a throw and a rejected promise. */
    private start(element: AudioLike): void {
        try {
            element.currentTime = 0;
            const played = element.play();
            if (played !== undefined && typeof played.then === 'function') {
                played.then(undefined, () => undefined);
            }
        } catch {
            // A browser that refuses the sound must never break the game.
        }
    }

    private element(name: SoundName): AudioLike {
        let element = this.elements[name];
        if (element === undefined) {
            element = this.createElement(SAMPLES[name].src);
            element.playbackRate = SAMPLES[name].playbackRate;
            this.elements[name] = element;
        }
        return element;
    }

    private music(): AudioLike {
        if (this.musicElement === null) {
            const element = this.createElement(MUSIC_SRC);
            element.loop = true;
            element.playbackRate = this.musicRate;
            this.musicElement = element;
        }
        return this.musicElement;
    }

    private createElement(src: string): AudioLike {
        const element = this.factory(src);
        // A fresh element obeys the mute the game already carries.
        element.muted = this.isMuted;
        return element;
    }

    private allElements(): AudioLike[] {
        const elements: AudioLike[] = [];
        for (const name of Object.keys(SAMPLES) as SoundName[]) {
            const element = this.elements[name];
            if (element !== undefined) elements.push(element);
        }
        if (this.musicElement !== null) elements.push(this.musicElement);
        return elements;
    }
}

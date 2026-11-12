import { describe, expect, it } from "vitest";
import { Sound, type AudioLike } from "./sound";

/** A fake element: counts plays and pauses and can misbehave on play(). */
class FakeAudio implements AudioLike {
    src: string;
    playMode: "ok" | "reject" | "throw";
    plays = 0;
    pauses = 0;
    currentTime = 123;
    loop = false;
    playbackRate = 1;
    volume = 1;
    muted = false;

    constructor(src: string, playMode: "ok" | "reject" | "throw") {
        this.src = src;
        this.playMode = playMode;
    }

    play(): Promise<void> | void {
        this.plays++;
        if (this.playMode === "throw") throw new Error("play threw");
        if (this.playMode === "reject") return Promise.reject(new Error("NotAllowedError"));
        return Promise.resolve();
    }

    pause(): void {
        this.pauses++;
    }
}

/** A Sound plus every fake element its factory made, in creation order. */
function harness(playMode: "ok" | "reject" | "throw" = "ok") {
    const made: FakeAudio[] = [];
    const sound = new Sound((src) => {
        const fake = new FakeAudio(src, playMode);
        made.push(fake);
        return fake;
    });
    const forSrc = (src: string): FakeAudio[] => made.filter((fake) => fake.src === src);
    return { sound, made, forSrc };
}

/** The music element's plays so far; 0 when it never got to make noise. */
function musicPlays(forSrc: (src: string) => FakeAudio[]): number {
    return forSrc("/standoff-loop.mp3").reduce((plays, fake) => plays + fake.plays, 0);
}

/** Let any rejected promise settle so an unhandled one would surface. */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Sound before unlock", () => {
    it("startMusic() before unlock() creates nothing and plays nothing", () => {
        const { sound, made } = harness();
        sound.startMusic();
        expect(made).toHaveLength(0);
    });

    it("unlock() starts the music only when it was already wanted", () => {
        const silent = harness();
        silent.sound.unlock();
        expect(silent.made).toHaveLength(0);

        const { sound, forSrc } = harness();
        sound.startMusic();
        sound.unlock();
        const music = forSrc("/standoff-loop.mp3");
        expect(music).toHaveLength(1);
        expect(music[0].plays).toBe(1);
        expect(music[0].loop).toBe(true);
    });
});

describe("Sound music element is one", () => {
    it("ten start/stop cycles create exactly one element", () => {
        const { sound, made, forSrc } = harness();
        sound.unlock();
        for (let i = 0; i < 10; i++) {
            sound.startMusic();
            sound.stopMusic();
        }
        expect(made).toHaveLength(1);
        expect(forSrc("/standoff-loop.mp3")).toHaveLength(1);
        expect(forSrc("/standoff-loop.mp3")[0].plays).toBe(10);
        expect(forSrc("/standoff-loop.mp3")[0].currentTime).toBe(0); // every start rewound it
    });
});

describe("Sound swallows rejected and thrown play()", () => {
    it("a play() returning a rejected promise neither throws nor goes unhandled", async () => {
        const { sound, forSrc } = harness("reject");
        sound.unlock();
        expect(() => sound.startMusic()).not.toThrow();
        await settle(); // an unhandled rejection would surface here
        expect(forSrc("/standoff-loop.mp3")[0].plays).toBe(1);
    });

    it("a play() that throws is swallowed", () => {
        const { sound, forSrc } = harness("throw");
        sound.unlock();
        expect(() => sound.startMusic()).not.toThrow();
        expect(forSrc("/standoff-loop.mp3")[0].plays).toBe(1);
    });
});

describe("Sound mute", () => {
    it("while muted, startMusic() calls no element's play", () => {
        const { sound, made } = harness();
        sound.unlock();
        sound.setMuted(true);
        expect(sound.muted).toBe(true);
        sound.startMusic();
        expect(made.every((fake) => fake.plays === 0)).toBe(true);
    });

    it("unmuting while the music should be playing resumes it", () => {
        const { sound, forSrc } = harness();
        sound.unlock();
        sound.startMusic();
        const music = forSrc("/standoff-loop.mp3")[0];
        expect(music.plays).toBe(1);

        sound.setMuted(true);
        expect(music.pauses).toBe(1);

        sound.setMuted(false);
        expect(music.plays).toBe(2);
    });

    it("unmuting when the music was stopped does not start it", () => {
        const { sound, made } = harness();
        sound.unlock();
        sound.setMuted(true);
        sound.setMuted(false);
        expect(made).toHaveLength(0);
    });
});

describe("Sound hidden tab", () => {
    it("setHidden(true) pauses a playing music element and setHidden(false) resumes it", () => {
        const { sound, forSrc } = harness();
        sound.unlock();
        sound.startMusic();
        const music = forSrc("/standoff-loop.mp3")[0];

        sound.setHidden(true);
        expect(music.pauses).toBe(1);

        sound.setHidden(false);
        expect(music.plays).toBe(2);
    });

    it("if the music was stopped, setHidden(false) does not start it", () => {
        const { sound, made, forSrc } = harness();
        sound.unlock();
        sound.startMusic();
        sound.stopMusic();
        const playsAfterStop = forSrc("/standoff-loop.mp3")[0].plays;

        sound.setHidden(true);
        sound.setHidden(false);
        expect(made).toHaveLength(1);
        expect(forSrc("/standoff-loop.mp3")[0].plays).toBe(playsAfterStop);
        expect(forSrc("/standoff-loop.mp3")[0].pauses).toBe(1); // only stopMusic's pause
    });

    it("a hidden tab never starts the music, and it starts when the tab returns", () => {
        const { sound, forSrc } = harness();
        sound.unlock();
        sound.setHidden(true);
        sound.startMusic();
        expect(musicPlays(forSrc)).toBe(0);

        sound.setHidden(false);
        expect(musicPlays(forSrc)).toBe(1);
    });
});

describe("Sound music rate", () => {
    it("setMusicRate(0.79) sets the playing element's playbackRate", () => {
        const { sound, forSrc } = harness();
        sound.unlock();
        sound.startMusic();
        sound.setMusicRate(0.79);
        expect(forSrc("/standoff-loop.mp3")[0].playbackRate).toBe(0.79);
    });

    it("a rate set before the music exists is applied when it is created", () => {
        const { sound, forSrc } = harness();
        sound.setMusicRate(0.7);
        sound.unlock();
        sound.startMusic();
        expect(forSrc("/standoff-loop.mp3")[0].playbackRate).toBe(0.7);
    });
});

describe("Sound stopAll", () => {
    it("pauses and rewinds the created element and forgets a wanted music", () => {
        const { sound, made, forSrc } = harness();
        sound.unlock();
        sound.startMusic();
        sound.stopAll();
        expect(made.every((fake) => fake.pauses === 1 && fake.currentTime === 0)).toBe(true);

        // The music stays stopped: unhiding does not resurrect it.
        sound.setHidden(true);
        sound.setHidden(false);
        expect(forSrc("/standoff-loop.mp3")[0].plays).toBe(1);
    });
});

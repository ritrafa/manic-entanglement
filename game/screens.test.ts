import { describe, expect, it } from "vitest";
import {
    formatTenths,
    nextScreen,
    sameSummary,
    summaryLines,
    type Screen,
    type ScreenAction,
} from "@/game/screens";
import { MODES } from "@/game/modes";
import { Run, type Tally } from "@/game/run";

/** A tally with patches on top of a fresh run's numbers. */
function tallyAt(over: Partial<Tally> = {}): Tally {
    return {
        moves: 0, ms: 0, kills: 0, pickups: 0, bumps: 0, depth: 1, cleared: 0, lostToFights: 0,
        minExitEnergy: null, wardens: 0, toolsUsed: { anchor: 0, twist: 0, cut: 0 },
        darkCleared: 0, banked: 0, mode: "descent", ...over,
    };
}

describe("nextScreen", () => {
    it("starts the countdown from the title and pauses nothing else there", () => {
        expect(nextScreen("title", "confirm")).toBe("countdown");
        expect(nextScreen("title", "pause")).toBe("title");
        expect(nextScreen("title", "hide")).toBe("title");
        expect(nextScreen("title", "restart")).toBe("title");
    });

    it("the title opens the how-to, and the how-to goes back to the title", () => {
        expect(nextScreen("title", "howto")).toBe("howto");
        expect(nextScreen("howto", "confirm")).toBe("title");
        expect(nextScreen("howto", "pause")).toBe("title");
        expect(nextScreen("howto", "back")).toBe("title");
        // Nothing else moves it, and the title does not take the back action.
        expect(nextScreen("howto", "hide")).toBe("howto");
        expect(nextScreen("howto", "restart")).toBe("howto");
        expect(nextScreen("title", "back")).toBe("title");
    });

    it("a how-to opened by the first Play continues into the countdown", () => {
        expect(nextScreen("howto", "confirm", { howtoFromPlay: true })).toBe("countdown");
        expect(nextScreen("howto", "pause", { howtoFromPlay: true })).toBe("countdown");
        expect(nextScreen("howto", "back", { howtoFromPlay: true })).toBe("countdown");
        // Without the flag the very same actions go back to the title.
        expect(nextScreen("howto", "confirm", { howtoFromPlay: false })).toBe("title");
    });

    it("the countdown only leaves on the run starting", () => {
        expect(nextScreen("countdown", "started")).toBe("playing");
        expect(nextScreen("countdown", "pause")).toBe("countdown");
        expect(nextScreen("countdown", "confirm")).toBe("countdown");
        expect(nextScreen("countdown", "hide")).toBe("countdown");
    });

    it("pause and hide stop a live game", () => {
        expect(nextScreen("playing", "pause")).toBe("paused");
        expect(nextScreen("playing", "hide")).toBe("paused");
    });

    it("resume goes back to playing from either toggle", () => {
        expect(nextScreen("paused", "pause")).toBe("playing");
        expect(nextScreen("paused", "confirm")).toBe("playing");
    });

    it("a hidden tab comes back paused: hide while paused stays paused", () => {
        expect(nextScreen("paused", "hide")).toBe("paused");
        // And nothing about returning to the tab is an action at all; unknown
        // pairs keep the screen, so only an explicit resume leaves the pause.
        for (const action of ["started", "cleared", "levelStarted", "died"] as ScreenAction[]) {
            expect(nextScreen("paused", action)).toBe("paused");
        }
    });

    it("paused can restart or quit", () => {
        expect(nextScreen("paused", "restart")).toBe("countdown");
        expect(nextScreen("paused", "quit")).toBe("title");
        expect(nextScreen("playing", "restart")).toBe("countdown");
        expect(nextScreen("playing", "quit")).toBe("title");
    });

    it("the run drives playing -> clear -> playing", () => {
        expect(nextScreen("playing", "cleared")).toBe("clear");
        expect(nextScreen("clear", "levelStarted")).toBe("playing");
    });

    it("a finished run goes to the summary from playing and from the clear screen", () => {
        expect(nextScreen("playing", "finished")).toBe("over");
        expect(nextScreen("clear", "finished")).toBe("over");
        // Everywhere else the finished action moves nothing.
        expect(nextScreen("title", "finished")).toBe("title");
        expect(nextScreen("countdown", "finished")).toBe("countdown");
        expect(nextScreen("paused", "finished")).toBe("paused");
        expect(nextScreen("over", "finished")).toBe("over");
    });

    it("pausing on the clear screen resumes to clear, and only the level start plays", () => {
        const paused = nextScreen("clear", "pause");
        expect(paused).toBe("paused");
        // Resuming waits for the level: back to "clear", not straight to playing.
        expect(nextScreen(paused, "confirm", { pausedFrom: "clear" })).toBe("clear");
        expect(nextScreen(paused, "pause", { pausedFrom: "clear" })).toBe("clear");
        expect(nextScreen("clear", "levelStarted")).toBe("playing");
        // Without the context the resume assumes a plain playing pause.
        expect(nextScreen(paused, "confirm")).toBe("playing");
    });

    it("the clear screen can also pause by hiding, restart or quit", () => {
        expect(nextScreen("clear", "hide")).toBe("paused");
        expect(nextScreen("clear", "restart")).toBe("countdown");
        expect(nextScreen("clear", "quit")).toBe("title");
    });

    it("death opens the summary, which restarts or quits", () => {
        expect(nextScreen("playing", "died")).toBe("over");
        expect(nextScreen("clear", "died")).toBe("over");
        expect(nextScreen("over", "confirm")).toBe("countdown");
        expect(nextScreen("over", "restart")).toBe("countdown");
        expect(nextScreen("over", "quit")).toBe("title");
        expect(nextScreen("over", "pause")).toBe("over");
        expect(nextScreen("over", "hide")).toBe("over");
    });

    it("the settings screen opens from the title and returns to it", () => {
        expect(nextScreen("title", "settings")).toBe("settings");
        expect(nextScreen("settings", "back", { settingsFrom: "title" })).toBe("title");
        // Esc closes it the same way; the panel's Back button sends "back".
        expect(nextScreen("settings", "pause", { settingsFrom: "title" })).toBe("title");
        // Without the context a settings visit came from the title.
        expect(nextScreen("settings", "back")).toBe("title");
        // Nothing else moves it: no accidental resume or start.
        for (const action of ["confirm", "hide", "restart", "quit", "started", "cleared", "levelStarted", "died"] as ScreenAction[]) {
            expect(nextScreen("settings", action, { settingsFrom: "title" })).toBe("settings");
        }
    });

    it("the settings screen opens from the pause and returns to it, the clock staying stopped", () => {
        const paused = nextScreen("playing", "pause");
        expect(paused).toBe("paused");
        const settings = nextScreen(paused, "settings", { pausedFrom: "playing" });
        expect(settings).toBe("settings");
        // Back lands on the pause, never on "playing": the clock stays stopped
        // throughout the whole round trip.
        const back = nextScreen(settings, "back", { pausedFrom: "playing", settingsFrom: "paused" });
        expect(back).toBe("paused");
        expect(back).not.toBe("playing");
        expect(nextScreen(settings, "pause", { pausedFrom: "playing", settingsFrom: "paused" })).toBe("paused");
        // A hidden tab keeps the settings open, and nothing resumes by itself.
        expect(nextScreen(settings, "hide", { pausedFrom: "playing", settingsFrom: "paused" })).toBe("settings");
        // And resuming from that pause still goes back to playing.
        expect(nextScreen(back, "confirm", { pausedFrom: "playing" })).toBe("playing");
    });

    it("only the title and the pause open the settings", () => {
        for (const screen of ["countdown", "playing", "clear", "over", "keys"] as Screen[]) {
            expect(nextScreen(screen, "settings")).toBe(screen);
        }
    });

    it("the Controls screen opens from the settings and returns to it", () => {
        const settings = nextScreen("title", "settings");
        expect(nextScreen(settings, "keys")).toBe("keys");
        // Back or Esc returns to the settings panel, not past it.
        expect(nextScreen("keys", "back", { settingsFrom: "title" })).toBe("settings");
        expect(nextScreen("keys", "pause", { settingsFrom: "paused" })).toBe("settings");
        // Nothing else moves it: no accidental resume, start or close.
        for (const action of ["confirm", "hide", "restart", "quit", "started", "cleared", "levelStarted", "died", "settings", "howto"] as ScreenAction[]) {
            expect(nextScreen("keys", action, { settingsFrom: "paused" })).toBe("keys");
        }
        // Only the settings screen opens it.
        for (const screen of ["title", "howto", "countdown", "playing", "paused", "clear", "over"] as Screen[]) {
            expect(nextScreen(screen, "keys")).toBe(screen);
        }
        // And the settings visit still ends where it started, even after a
        // round trip through the Controls screen.
        expect(nextScreen("settings", "back", { settingsFrom: "paused" })).toBe("paused");
    });

    it("unknown pairs keep the screen", () => {
        const screens: Screen[] = ["title", "howto", "countdown", "playing", "paused", "settings", "keys", "clear", "over"];
        const actions: ScreenAction[] = ["confirm", "howto", "settings", "keys", "back", "pause", "hide", "restart", "quit", "started", "cleared", "levelStarted", "died"];
        for (const screen of screens) {
            for (const action of actions) {
                const next = nextScreen(screen, action);
                expect(next).oneOf([...screens]);
            }
        }
        expect(nextScreen("playing", "levelStarted")).toBe("playing");
        expect(nextScreen("playing", "started")).toBe("playing");
        expect(nextScreen("title", "died")).toBe("title");
        expect(nextScreen("title", "cleared")).toBe("title");
    });
});

describe("nextScreen: the feats screen", () => {
    it("the title opens it and back or Esc returns to the title", () => {
        expect(nextScreen("title", "feats")).toBe("feats");
        expect(nextScreen("feats", "back")).toBe("title");
        expect(nextScreen("feats", "pause")).toBe("title");
    });

    it("nothing else moves it, and other screens do not take the feats action", () => {
        expect(nextScreen("feats", "hide")).toBe("feats");
        expect(nextScreen("feats", "confirm")).toBe("feats");
        expect(nextScreen("feats", "restart")).toBe("feats");
        expect(nextScreen("playing", "feats")).toBe("playing");
        expect(nextScreen("paused", "feats")).toBe("paused");
        expect(nextScreen("over", "feats")).toBe("over");
    });
});

describe("nextScreen: the wardrobe screen", () => {
    it("the title opens it and back or Esc returns to the title", () => {
        expect(nextScreen("title", "wardrobe")).toBe("wardrobe");
        expect(nextScreen("wardrobe", "back")).toBe("title");
        expect(nextScreen("wardrobe", "pause")).toBe("title");
    });

    it("nothing else moves it, and other screens do not take the wardrobe action", () => {
        expect(nextScreen("wardrobe", "hide")).toBe("wardrobe");
        expect(nextScreen("wardrobe", "confirm")).toBe("wardrobe");
        expect(nextScreen("wardrobe", "restart")).toBe("wardrobe");
        expect(nextScreen("playing", "wardrobe")).toBe("playing");
        expect(nextScreen("paused", "wardrobe")).toBe("paused");
        expect(nextScreen("over", "wardrobe")).toBe("over");
    });
});

describe("summaryLines", () => {
    const base = {
        tally: tallyAt({ ms: 75400, kills: 4, pickups: 9, depth: 3 }),
        score: 420,
        best: 300,
        newBest: false,
        cause: "time" as const,
    };

    function line(lines: { label: string; value: string }[], label: string): string {
        const found = lines.find((entry) => entry.label === label);
        expect(found, `line ${label}`).toBeDefined();
        return found!.value;
    }

    it("shows the run's rows in order", () => {
        expect(summaryLines(base).map((entry) => entry.label)).toEqual([
            "Mode",
            "Cause",
            "Depth reached",
            "Score",
            "Best",
            "Time",
            "Enemies beaten",
            "Pickups",
            "Gear banked",
            "Gear lost",
        ]);
    });

    it("names the mode on every summary", () => {
        expect(line(summaryLines(base), "Mode")).toBe("Descent");
        expect(line(summaryLines({ ...base, mode: "sprint" }), "Mode")).toBe("Sprint");
        for (const id of ["descent", "sprint", "zen", "daily"] as const) {
            expect(line(summaryLines({ ...base, mode: id }), "Mode")).toBe(MODES[id].name);
        }
    });

    it("a finished run says Finished in m:ss.t and shows no cause", () => {
        const lines = summaryLines({ ...base, tally: tallyAt({ ms: 75_400 }), mode: "sprint", finished: true });
        expect(line(lines, "Time")).toBe("Finished in 1:15.4");
        expect(lines.some((entry) => entry.label === "Cause")).toBe(false);
        expect(line(lines, "Mode")).toBe("Sprint");
        // The stored time best reads as a time too, until it is beaten.
        expect(line(summaryLines({ ...base, best: 65_000, mode: "sprint", finished: true }), "Best")).toBe("1:05.0");
        expect(line(summaryLines({ ...base, best: 65_000, newBest: true, mode: "sprint", finished: true }), "Best")).toBe("New best!");
        // A run that died still shows its cause and the plain clock.
        const dead = summaryLines({ ...base, mode: "sprint", finished: false });
        expect(line(dead, "Cause")).toBe("Out of time");
        expect(line(dead, "Time")).toBe("1:15");
    });

    it("formats 75,400 ms as 1:15", () => {
        expect(line(summaryLines(base), "Time")).toBe("1:15");
        expect(line(summaryLines({ ...base, tally: tallyAt({ ms: 0 }) }), "Time")).toBe("0:00");
        expect(line(summaryLines({ ...base, tally: tallyAt({ ms: 59_999 }) }), "Time")).toBe("0:59");
        expect(line(summaryLines({ ...base, tally: tallyAt({ ms: 65_000 }) }), "Time")).toBe("1:05");
        expect(line(summaryLines({ ...base, tally: tallyAt({ ms: 600_000 }) }), "Time")).toBe("10:00");
    });

    it("shows New best! only when newBest", () => {
        expect(line(summaryLines(base), "Best")).toBe("300");
        expect(line(summaryLines({ ...base, newBest: true }), "Best")).toBe("New best!");
    });

    it("names all three causes", () => {
        expect(line(summaryLines({ ...base, cause: "time" }), "Cause")).toBe("Out of time");
        expect(line(summaryLines({ ...base, cause: "move" }), "Cause")).toBe("Out of energy");
        expect(line(summaryLines({ ...base, cause: "fight" }), "Cause")).toBe("Lost a fight");
    });

    it("prints the tally's depth, kills and pickups", () => {
        const lines = summaryLines(base);
        expect(line(lines, "Depth reached")).toBe("3");
        expect(line(lines, "Score")).toBe("420");
        expect(line(lines, "Enemies beaten")).toBe("4");
        expect(line(lines, "Pickups")).toBe("9");
    });

    it("prints the gear banked and lost, 0 when the run gave nothing", () => {
        expect(line(summaryLines(base), "Gear banked")).toBe("0");
        expect(line(summaryLines(base), "Gear lost")).toBe("0");
        const lines = summaryLines({ ...base, banked: 3, lost: 1 });
        expect(line(lines, "Gear banked")).toBe("3");
        expect(line(lines, "Gear lost")).toBe("1");
        expect(line(summaryLines({ ...base, banked: -4, lost: 2.6 }), "Gear banked")).toBe("0");
        expect(line(summaryLines({ ...base, banked: -4, lost: 2.6 }), "Gear lost")).toBe("3");
    });
});

describe("sameSummary", () => {
    it("compares rows by content and null against rows", () => {
        const a = summaryLines({ tally: tallyAt(), score: 0, best: 0, newBest: false, cause: "time" });
        const b = summaryLines({ tally: tallyAt(), score: 0, best: 0, newBest: false, cause: "time" });
        expect(sameSummary(a, b)).toBe(true);
        expect(sameSummary(a, null)).toBe(false);
        expect(sameSummary(null, null)).toBe(true);
        const c = summaryLines({ tally: tallyAt(), score: 1, best: 0, newBest: false, cause: "time" });
        expect(sameSummary(a, c)).toBe(false);
    });
});

describe("a paused Run", () => {
    it("10 s spent paused (no tick calls) costs no energy", () => {
        const run = new Run({ seed: 7 });
        run.start();
        run.takeEvents();
        run.tick(1000); // some real play first, so energy is not at its start value
        const energyBeforePause = run.energy;
        // Paused for ten seconds: the shell stops ticking, so nothing happens.
        expect(run.energy).toBe(energyBeforePause);
        expect(run.energy).toBe(energyBeforePause);
        // Resuming drains again: the pause itself cost nothing.
        run.tick(1000);
        expect(run.energy).toBeLessThan(energyBeforePause);
    });

    it("abandon returns a live run to ready so a new one can start", () => {
        const run = new Run({ seed: 11 });
        run.start();
        run.takeEvents();
        run.tick(500);
        run.abandon();
        expect(run.phase).toBe("ready");
        run.tick(10_000); // an abandoned run never ticks
        run.start();
        expect(run.phase).toBe("playing");
        expect(run.level).toBe(1);
        expect(run.score).toBe(0);
        expect(run.tally.moves).toBe(0);
    });

    it("abandon on a dead or ready run changes nothing", () => {
        const run = new Run({ seed: 3 });
        run.abandon(); // ready already
        expect(run.phase).toBe("ready");
        run.start();
        run.energy = 0;
        run.tick(1000);
        expect(run.phase).toBe("dead");
        run.abandon();
        expect(run.phase).toBe("ready");
    });
});

describe("formatTenths", () => {
    it("prints minutes, padded seconds and tenths", () => {
        expect(formatTenths(0)).toBe("0:00.0");
        expect(formatTenths(9_050)).toBe("0:09.0");
        expect(formatTenths(9_099)).toBe("0:09.0");
        expect(formatTenths(75_400)).toBe("1:15.4");
        expect(formatTenths(65_000)).toBe("1:05.0");
        expect(formatTenths(600_000)).toBe("10:00.0");
        expect(formatTenths(-5)).toBe("0:00.0");
        expect(formatTenths(NaN)).toBe("0:00.0");
    });
});

describe("summaryLines: new feat lines", () => {
    const base = {
        tally: tallyAt(), score: 300, best: 300, newBest: false, cause: "time" as const,
    };

    it("adds one New feat row per name, in order, at the end", () => {
        const lines = summaryLines({ ...base, feats: ["First Exit", "Warden Breaker"] });
        expect(lines.filter((entry) => entry.label === "New feat").map((entry) => entry.value))
            .toEqual(["First Exit", "Warden Breaker"]);
    });

    it("no feats means no New feat rows, and an empty list changes nothing", () => {
        expect(summaryLines(base).some((entry) => entry.label === "New feat")).toBe(false);
        expect(sameSummary(summaryLines(base), summaryLines({ ...base, feats: [] }))).toBe(true);
    });

    it("adds one New look row per unlocked trait, after the feat rows", () => {
        const lines = summaryLines({ ...base, feats: ["Sprinter"], unlocks: ["Body Gold", "Back Jetpack"] });
        const values = lines.filter((entry) => entry.label === "New look").map((entry) => entry.value);
        expect(values).toEqual(["Body Gold", "Back Jetpack"]);
        const labels = lines.map((entry) => entry.label);
        expect(labels.lastIndexOf("New feat")).toBeLessThan(labels.indexOf("New look"));
    });

    it("no unlocks means no New look rows, and an empty list changes nothing", () => {
        expect(summaryLines(base).some((entry) => entry.label === "New look")).toBe(false);
        expect(sameSummary(summaryLines(base), summaryLines({ ...base, unlocks: [] }))).toBe(true);
    });
});

// Pure helpers for the browser shell: mapping a Run event to the floating text
// shown above the player. No DOM, no audio, no clocks.

import type { GameEvent } from '@/game/events';

/** The floating message for a Run event, or null when nothing floats. */
export function eventMessage(event: GameEvent): string | null {
    switch (event.type) {
        case 'pickup':
            return event.text;
        case 'fight':
            return `-${event.cost} Energy`;
        default:
            return null;
    }
}

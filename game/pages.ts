// The paging arithmetic of the wardrobe grid (E64). Pure numbers — no DOM.
// The grid shows as many whole cards as fit in the space it has (columns x
// rows, measured from its box by components/Wardrobe.tsx); everything else
// waits on further pages. A page always holds at least one card.

/** How many pages `total` cards need when `pageSize` of them fit at once.
 *  Always at least 1, even for an empty list, so the controls have a page. */
export function pageCount(total: number, pageSize: number): number {
    const size = normalizeSize(pageSize);
    const count = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
    return Math.max(1, Math.ceil(count / size));
}

/** The cards of `page` (0-based), the rest staying on the other pages. The
 *  page is clamped into range, and a non-empty list never hands back an
 *  empty page. */
export function cardsOnPage<T>(cards: readonly T[], page: number, pageSize: number): T[] {
    const size = normalizeSize(pageSize);
    const p = clampPage(page, cards.length, size);
    return cards.slice(p * size, p * size + size);
}

/** The page (0-based) that holds the card at `index` when `pageSize` of
 *  them fit at once. Negative indices sit on the first page. */
export function pageForIndex(index: number, pageSize: number): number {
    const size = normalizeSize(pageSize);
    const i = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
    return Math.floor(i / size);
}

/** Keep `page` inside the pages that `total` cards make at `pageSize` —
 *  used when the grid is resized and its pages hold a different number of
 *  cards, so the player stays on a page that exists. */
export function clampPage(page: number, total: number, pageSize: number): number {
    const last = pageCount(total, pageSize) - 1;
    if (!Number.isFinite(page)) return 0;
    return Math.min(Math.max(0, Math.floor(page)), last);
}

/** A page holds a whole number of cards, at least one. */
function normalizeSize(pageSize: number): number {
    if (!Number.isFinite(pageSize)) return 1;
    return Math.max(1, Math.floor(pageSize));
}

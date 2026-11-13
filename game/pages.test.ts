import { describe, expect, it } from "vitest";
import { cardsOnPage, clampPage, pageForIndex, pageCount } from "@/game/pages";

describe("pageCount", () => {
  it("an empty list still has one page", () => {
    expect(pageCount(0, 4)).toBe(1);
  });

  it("cards split into whole pages plus a part page", () => {
    expect(pageCount(10, 4)).toBe(3);
    expect(pageCount(8, 4)).toBe(2);
    expect(pageCount(1, 4)).toBe(1);
  });

  it("a page of one puts every card on its own page", () => {
    expect(pageCount(23, 1)).toBe(23);
  });

  it("a nonsense page size still fits at least one card per page", () => {
    expect(pageCount(10, 0)).toBe(10);
    expect(pageCount(10, -3)).toBe(10);
    expect(pageCount(10, NaN)).toBe(10);
    expect(pageCount(10, 2.7)).toBe(5);
  });

  it("a nonsense card count is an empty list", () => {
    expect(pageCount(-5, 4)).toBe(1);
    expect(pageCount(NaN, 4)).toBe(1);
  });
});

describe("cardsOnPage", () => {
  const cards = Array.from({ length: 10 }, (_, i) => i);

  it("hands back the page's slice in order", () => {
    expect(cardsOnPage(cards, 0, 4)).toEqual([0, 1, 2, 3]);
    expect(cardsOnPage(cards, 2, 4)).toEqual([8, 9]);
  });

  it("a page past the end clamps to the last page", () => {
    expect(cardsOnPage(cards, 99, 4)).toEqual([8, 9]);
  });

  it("a page before the start clamps to the first", () => {
    expect(cardsOnPage(cards, -2, 4)).toEqual([0, 1, 2, 3]);
  });

  it("a non-empty list never hands back an empty page", () => {
    for (const size of [1, 3, 4, 10, 40]) {
      for (let p = 0; p < pageCount(10, size); p += 1) {
        expect(cardsOnPage(cards, p, size).length).toBeGreaterThan(0);
      }
    }
  });

  it("an empty list has one empty page", () => {
    expect(cardsOnPage([], 0, 4)).toEqual([]);
  });

  it("the pages cover every card exactly once", () => {
    const pages = Array.from({ length: pageCount(10, 3) }, (_, p) => p);
    const seen = pages.flatMap((p) => cardsOnPage(cards, p, 3));
    expect(seen).toEqual(cards);
  });
});

describe("pageForIndex", () => {
  it("the first page holds the first page-size cards", () => {
    expect(pageForIndex(0, 4)).toBe(0);
    expect(pageForIndex(3, 4)).toBe(0);
  });

  it("the next card opens the next page", () => {
    expect(pageForIndex(4, 4)).toBe(1);
    expect(pageForIndex(9, 4)).toBe(2);
  });

  it("a negative or nonsense index sits on the first page", () => {
    expect(pageForIndex(-7, 4)).toBe(0);
    expect(pageForIndex(NaN, 4)).toBe(0);
  });

  it("a nonsense page size still counts one card per page", () => {
    expect(pageForIndex(5, 0)).toBe(5);
    expect(pageForIndex(5, NaN)).toBe(5);
  });
});

describe("clampPage", () => {
  it("a page inside the range stays put", () => {
    expect(clampPage(1, 10, 4)).toBe(1);
  });

  it("a page past the end falls back to the last one", () => {
    expect(clampPage(7, 10, 4)).toBe(2);
  });

  it("a page before the start lands on the first", () => {
    expect(clampPage(-3, 10, 4)).toBe(0);
  });

  it("a nonsense page is the first page", () => {
    expect(clampPage(NaN, 10, 4)).toBe(0);
  });

  it("clamping when the page size changes keeps a page that exists", () => {
    // At 2 per page 10 cards make five pages; the sixth falls to the last...
    expect(clampPage(5, 10, 2)).toBe(4);
    // ...and when the grid grows to 4 per page it falls into range.
    expect(clampPage(3, 10, 4)).toBe(2);
    // An empty list has exactly the one page.
    expect(clampPage(3, 0, 4)).toBe(0);
  });
});

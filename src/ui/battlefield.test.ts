import { describe, expect, it } from "vitest";
import { shipKind } from "./battlefield";
import { missions } from "../engine/missions";

describe("ship sprites", () => {
  it("matches classes to ships by name, and by position when the name is unknown", () => {
    expect(shipKind("Attack", 3)).toBe(0);
    expect(shipKind("Recon", 0)).toBe(1);
    expect(shipKind("Supply", 1)).toBe(2);
    expect(shipKind("escort", 0)).toBe(3);
    expect(shipKind("Dreadnought", 2)).toBe(2);
    expect(shipKind("Dreadnought", 5)).toBe(1);
  });

  it("gives every class in every mission the ship of its own name", () => {
    for (const m of missions()) for (const [k, cls] of m.scenario.classes.entries()) expect(["attack", "recon", "supply", "escort"][shipKind(cls.name, k)]).toBe(cls.name.toLowerCase());
  });
});

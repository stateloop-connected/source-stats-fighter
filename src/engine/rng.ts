/** Seeded random numbers (sfc32, seeded through splitmix32), with standard normals by Box–Muller. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private spare: number | null = null;

  constructor(seed: number) {
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    for (let i = 0; i < 15; i++) this.uint32();
  }

  uint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform on the open interval (0, 1). */
  uniform(): number {
    return (this.uint32() + 0.5) / 4294967296;
  }

  normal(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    const u1 = this.uniform();
    const u2 = this.uniform();
    const r = Math.sqrt(-2 * Math.log(u1));
    const th = 2 * Math.PI * u2;
    this.spare = r * Math.sin(th);
    return r * Math.cos(th);
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** Derive an independent seed for a sub-stream (e.g. battle number b of a simulation). */
export function deriveSeed(seed: number, index: number): number {
  let z = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

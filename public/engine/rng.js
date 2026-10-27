// Generadores deterministas. No usan Math.random.
// La misma semilla en el mismo motor de JavaScript produce la misma secuencia.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Uniforme en [0, 1) a partir de cuatro enteros. Cada evento de contagio
// tiene su propia llave (semilla, día, persona, sal), así que vacunar a
// alguien no reordena la suerte del resto.
export function unit(seed, a, b, c) {
  let x =
    (seed +
      Math.imul(a | 0, 0x9e3779b1) +
      Math.imul(b | 0, 0x85ebca77) +
      Math.imul(c | 0, 0xc2b2ae3d)) >>>
    0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

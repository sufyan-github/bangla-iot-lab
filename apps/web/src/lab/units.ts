/** Canvas layout in SVG user units. One breadboard pitch (2.54 mm) is 24 units. */
export const PITCH = 24;

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

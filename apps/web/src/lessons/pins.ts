/**
 * Pin names in lesson text (D-105). A bold word that is a pin's name is drawn
 * as the end of a jumper wire, striped by what the pin is for: red for power,
 * black for ground, yellow for a signal. These are the colours the lab gives
 * power and ground wires; signal wires take turns between yellow, blue and
 * green, so the stripe says "a signal", not which colour the wire will be.
 */
export type PinKind = 'power' | 'ground' | 'signal';

const POWER = new Set(['VCC', 'VIN', 'VDD', '3V3', '5V', '12V', '+']);
const GROUND = new Set(['GND', '−', '-']);
/** Signal pins by the shapes their names take on the lab's boards, modules and chips. */
const SIGNAL =
  /^(D\d{1,2}|A\d|AO|DO|DQ|OUT\d?|IN\d|TX\d?|RX\d?|TXD|RXD|SDA|SCL|SCK|MOSI|MISO|CS|DC|RST|RES|BLK|NSS|DIO\d|DIN|DOUT|DATA|TRIG|Trig|ECHO|Echo|EN[AB]|COM|NO|NC|STCP|SHCP|DS|CLK|CLR|PRE|LE|Q\d?|\dMR|\dCP)$/;

/** What kind of pin a word names, or null if it is not a pin's name. */
export function pinKind(word: string): PinKind | null {
  const name = word.trim();
  if (POWER.has(name) || /^[A-Z]{1,4}\+$/.test(name)) return 'power';
  if (GROUND.has(name) || /^[A-Z]{1,4}[−-]$/.test(name)) return 'ground';
  return SIGNAL.test(name) ? 'signal' : null;
}

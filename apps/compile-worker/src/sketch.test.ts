import { describe, expect, it } from 'vitest';
import { findFunctions, sketchToCpp } from './sketch';

const prototypes = (source: string) => findFunctions(source).map((f) => f.prototype);

describe('Arduino sketch preprocessing', () => {
  it('finds top-level functions and ignores control statements', () => {
    const source = `
int ledPin = 13;
void setup() {
  pinMode(ledPin, OUTPUT);
  if (ledPin > 3) { blinkTimes(2); }
  for (int i = 0; i < 3; i++) { }
}
void loop() { while (true) { } }
void blinkTimes(int count, int wait = 200) {
  // void notAFunction() {
}
unsigned long since(unsigned long start) { return millis() - start; }
const char* name() { return "void fake() {"; }
`;
    expect(prototypes(source)).toEqual([
      'void setup();',
      'void loop();',
      'void blinkTimes(int count, int wait);',
      'unsigned long since(unsigned long start);',
      'const char* name();',
    ]);
  });

  it('ignores code inside comments, strings, macros and classes', () => {
    const source = `
/* void hidden() { } */
#define MAKE(x) void x() { }
struct Light { void on() { } };
void setup() { }
void loop() { }
`;
    expect(prototypes(source)).toEqual(['void setup();', 'void loop();']);
  });

  it('keeps compiler messages on the original line numbers', () => {
    const source =
      'int pin = 13;\n\nvoid setup() {\n  later();\n}\nvoid loop() {}\nvoid later() {}\n';
    const cpp = sketchToCpp(source);
    expect(cpp.startsWith('#include <Arduino.h>\n#line 1 "sketch.ino"\nint pin = 13;\n\n')).toBe(
      true,
    );
    expect(cpp).toContain(
      'void setup();\nvoid loop();\nvoid later();\n#line 3 "sketch.ino"\nvoid setup() {',
    );
  });

  it('leaves a sketch with no functions alone', () => {
    expect(sketchToCpp('int x;\n')).toBe('#include <Arduino.h>\n#line 1 "sketch.ino"\nint x;\n');
  });
});

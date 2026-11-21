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

  it('ignores a web page kept in a raw string, JavaScript functions and all', () => {
    const source = [
      'const char PAGE[] PROGMEM = R"HTML(',
      '<script>',
      'async function load() {',
      '  const r = await fetch("/data");',
      '}',
      'function show(x) { return x; }',
      '</script>',
      ')HTML";',
      'enum Gesture { TAP, HOLD };',
      'Gesture readGesture() { return TAP; }',
      'void setup() { }',
      'void loop() { }',
    ].join('\n');
    expect(prototypes(source)).toEqual(['Gesture readGesture();', 'void setup();', 'void loop();']);

    // The declarations go in just before the first real function, so after the type they use.
    const lines = sketchToCpp(source).split('\n');
    expect(lines.indexOf('Gesture readGesture();')).toBeGreaterThan(
      lines.indexOf('enum Gesture { TAP, HOLD };'),
    );
    // The page itself is passed through untouched.
    expect(sketchToCpp(source)).toContain('async function load() {');
  });

  it('reads every form of raw string, and survives one that is never closed', () => {
    expect(prototypes('const char* a = R"(void fake() { })";\nvoid real() { }')).toEqual([
      'void real();',
    ]);
    expect(prototypes('auto b = u8R"x(int fake() { })x";\nvoid real() { }')).toEqual([
      'void real();',
    ]);
    // A ")" inside the text does not end it; only ")tag" followed by a quote does.
    expect(prototypes('auto c = R"js(f(); void fake() { } )" )js";\nvoid real() { }')).toEqual([
      'void real();',
    ]);
    expect(prototypes('void real() { }\nconst char* d = R"(void fake() { }')).toEqual([
      'void real();',
    ]);
    // A name that merely ends in R, followed by an ordinary string, is not a raw string.
    expect(prototypes('const char* e = LETTER"x";\nvoid real() { }')).toEqual(['void real();']);
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

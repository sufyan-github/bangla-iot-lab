import { describe, expect, it } from 'vitest';
import { Hd44780 } from './hd44780';

/** Drives the display the way the Arduino LiquidCrystal library does in 4-bit mode. */
function attach(lcd: Hd44780) {
  const byte = (rs: boolean, value: number) => {
    lcd.clock(rs, value >> 4);
    lcd.clock(rs, value & 0x0f);
  };
  const api = {
    begin() {
      for (const nibble of [0x3, 0x3, 0x3, 0x2]) lcd.clock(false, nibble);
      api.command(0x28); // 4-bit, two lines
      api.command(0x0c); // display on
      api.command(0x01); // clear
      api.command(0x06); // left to right
    },
    command: (value: number) => byte(false, value),
    print: (text: string) => [...text].forEach((ch) => byte(true, ch.charCodeAt(0))),
    setCursor: (column: number, row: number) => api.command(0x80 | (column + (row ? 0x40 : 0))),
  };
  return api;
}

describe('HD44780 character LCD', () => {
  it('ignores everything until the 4-bit handshake, then shows what is printed', () => {
    const lcd = new Hd44780();
    lcd.clock(true, 0x4);
    lcd.clock(true, 0x8); // would be "H" in 4-bit mode
    expect(lcd.lines()[0].trim()).toBe('');
    expect(lcd.displayOn).toBe(false);

    const driver = attach(lcd);
    driver.begin();
    driver.print('Hello, Bangla!');
    expect(lcd.displayOn).toBe(true);
    expect(lcd.lines()).toEqual(['Hello, Bangla!  ', '                ']);
  });

  it('positions text on the second line and overwrites in place', () => {
    const lcd = new Hd44780();
    const driver = attach(lcd);
    driver.begin();
    driver.setCursor(0, 1);
    driver.print('12 s');
    driver.setCursor(0, 1);
    driver.print('13');
    driver.setCursor(12, 0);
    driver.print('END');
    expect(lcd.lines()).toEqual(['            END ', '13 s            ']);
  });

  it('clears, homes and turns the display off', () => {
    const lcd = new Hd44780();
    const driver = attach(lcd);
    driver.begin();
    driver.print('abc');
    driver.command(0x02); // home
    driver.print('X');
    expect(lcd.lines()[0]).toBe('Xbc             ');
    driver.command(0x01);
    expect(lcd.lines()[0].trim()).toBe('');
    driver.command(0x08);
    expect(lcd.displayOn).toBe(false);
  });

  it('wraps from the end of line one onto line two, and shows unknown characters as blocks', () => {
    const lcd = new Hd44780();
    const driver = attach(lcd);
    driver.begin();
    driver.setCursor(0x27, 0);
    driver.print('AB');
    driver.setCursor(0, 0);
    driver.command(0x40); // custom-character memory: writes there are not shown
    driver.print('zz');
    driver.setCursor(1, 0);
    lcd.clock(true, 0xe);
    lcd.clock(true, 0x0); // 0xE0: outside ASCII
    expect(lcd.lines()).toEqual([' ▒              ', 'B               ']);
  });
});

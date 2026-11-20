import { describe, expect, it } from 'vitest';
import { Compiler, parseGccDiagnostics } from './compiler';
import { loadConfig } from './config';

describe('gcc diagnostics parser', () => {
  it('extracts position, severity and message', () => {
    const stderr = [
      'sketch.c: In function \'main\':',
      "sketch.c:7:3: error: 'PORTZ' undeclared (first use in this function)",
      'sketch.c:9:1: warning: control reaches end of non-void function [-Wreturn-type]',
      'sketch.c:2:10: fatal error: nothing.h: No such file or directory',
    ].join('\n');
    expect(parseGccDiagnostics(stderr)).toEqual([
      { line: 7, column: 3, severity: 'error', message: "'PORTZ' undeclared (first use in this function)" },
      { line: 9, column: 1, severity: 'warning', message: 'control reaches end of non-void function [-Wreturn-type]' },
      { line: 2, column: 10, severity: 'error', message: 'nothing.h: No such file or directory' },
    ]);
  });
});

describe('cache key', () => {
  const request = { board: 'uno', language: 'c', source: 'int main(void){}' } as const;
  const config = loadConfig({});

  it('is stable for identical input', () => {
    const compiler = new Compiler(config, 'avr-gcc 14.3.0');
    expect(compiler.cacheKey(request)).toBe(compiler.cacheKey({ ...request }));
    expect(compiler.cacheKey(request)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes with the source and with the toolchain', () => {
    const compiler = new Compiler(config, 'avr-gcc 14.3.0');
    expect(compiler.cacheKey({ ...request, source: 'int main(void){ }' })).not.toBe(
      compiler.cacheKey(request),
    );
    expect(new Compiler(config, 'avr-gcc 15.1.0').cacheKey(request)).not.toBe(
      compiler.cacheKey(request),
    );
  });
});

describe('configuration', () => {
  it('defaults to per-job sandboxing and refuses no sandbox in production', () => {
    expect(loadConfig({}).sandbox).toBe('bwrap');
    expect(() => loadConfig({ COMPILE_SANDBOX: 'none', NODE_ENV: 'production' })).toThrow();
    expect(() => loadConfig({ COMPILE_SANDBOX: 'docker' })).toThrow();
  });
});

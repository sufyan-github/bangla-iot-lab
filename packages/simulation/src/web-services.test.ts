import { describe, expect, it } from 'vitest';
import { LabWebServices, MAX_LOG_LINES, madeUpWeather, parseUrl } from './web-services';

const ask = (web: LabWebServices, method: string, url: string, body = '', timeMs = 0) =>
  web.handle({ from: 'U1', method, url, body, timeMs });

describe('the lab’s made-up web services', () => {
  it('reads addresses, with or without a port, path or query', () => {
    expect(parseUrl('http://weather.lab/now?city=Khulna')).toMatchObject({
      host: 'weather.lab',
      path: '/now',
    });
    expect(parseUrl('HTTP://Echo.Lab:8080')).toMatchObject({ host: 'echo.lab', path: '/' });
    expect(parseUrl('weather.lab/now')).toBeNull();
    expect(parseUrl('ftp://echo.lab/')).toBeNull();
  });

  it('echo.lab sends back what it got', () => {
    const web = new LabWebServices();
    expect(ask(web, 'post', 'http://echo.lab/data?x=1', 'temp=30')).toEqual({
      status: 200,
      type: 'text/plain',
      body: 'POST /data?x=1\n\ntemp=30',
    });
  });

  it('weather.lab makes up weather, says so, and lets it drift over time', () => {
    const web = new LabWebServices();
    const answer = ask(web, 'GET', 'http://weather.lab/now?city=Sylhet', '', 0)!;
    expect(answer.type).toBe('application/json');
    const now = JSON.parse(answer.body);
    expect(now).toMatchObject({ city: 'Sylhet', madeUp: true });
    expect(now.temperature).toBeGreaterThanOrEqual(19);
    expect(now.temperature).toBeLessThanOrEqual(37);
    // The same city at the same moment gives the same answer; later it has moved.
    expect(madeUpWeather('Sylhet', 0)).toEqual(now);
    expect(madeUpWeather('Sylhet', 15_000).temperature).not.toBe(now.temperature);
    // Another city is its own.
    expect(madeUpWeather('Rajshahi', 0).temperature).not.toBe(now.temperature);
    expect(JSON.parse(ask(web, 'GET', 'http://weather.lab/now')!.body).city).toBe('Dhaka');
    expect(ask(web, 'GET', 'http://weather.lab/tomorrow')!.status).toBe(404);
    expect(ask(web, 'POST', 'http://weather.lab/now')!.status).toBe(405);
  });

  it('log.lab keeps lines sent to it and gives them back', () => {
    const web = new LabWebServices();
    expect(ask(web, 'POST', 'http://log.lab/', 'temp=29.5')!.status).toBe(201);
    ask(web, 'POST', 'http://log.lab/', '  temp=30.1\n');
    expect(ask(web, 'GET', 'http://log.lab/')!.body).toBe('temp=29.5\ntemp=30.1');
    expect(ask(web, 'POST', 'http://log.lab/', '   ')!.status).toBe(400);
    for (let i = 0; i < MAX_LOG_LINES + 5; i++) ask(web, 'POST', 'http://log.lab/', `n=${i}`);
    expect(web.logLines).toHaveLength(MAX_LOG_LINES);
    expect(ask(web, 'GET', 'http://log.lab/')!.body.split('\n')).toHaveLength(20);
    ask(web, 'DELETE', 'http://log.lab/');
    expect(web.logLines).toHaveLength(0);
  });

  it('finds nobody anywhere else, and notes every call for the panel', () => {
    const web = new LabWebServices();
    expect(ask(web, 'GET', 'http://example.com/', '', 5)).toBeNull();
    expect(ask(web, 'GET', 'not an address', '', 6)).toBeNull();
    ask(web, 'GET', 'http://echo.lab/', '', 7);
    expect(web.takeLog()).toEqual([
      { from: 'U1', method: 'GET', url: 'http://example.com/', status: -1, timeMs: 5 },
      { from: 'U1', method: 'GET', url: 'not an address', status: -1, timeMs: 6 },
      { from: 'U1', method: 'GET', url: 'http://echo.lab/', status: 200, timeMs: 7 },
    ]);
    expect(web.takeLog()).toEqual([]);
  });
});

/**
 * The lab's made-up web services, for programs that use HTTPClient. There is
 * no real internet in the lab: a request to one of these names is answered
 * here, at once, and a request anywhere else finds nobody. Every answer is
 * made up by the lab, and says so where it carries data.
 *
 *   echo.lab     sends back the request it got, to see what a program sent
 *   weather.lab  /now?city=Dhaka gives a made-up temperature and humidity
 *   log.lab      keeps lines a program sends (POST) and gives them back (GET)
 */

export const LAB_SERVICES = ['echo.lab', 'weather.lab', 'log.lab'] as const;

/** One request a board made, kept for the lab's panel. */
export interface WebCall {
  /** The board that asked. */
  from: string;
  method: string;
  url: string;
  /** The status it got; -1 when nothing answered. */
  status: number;
  /** Session time, milliseconds. */
  timeMs: number;
}

export interface WebAnswer {
  status: number;
  type: string;
  body: string;
}

/** The most a request or answer body may hold, and how many lines log.lab keeps. */
export const MAX_WEB_BODY = 4096;
export const MAX_LOG_LINES = 50;
/** How many of the last calls are kept for the panel between frames. */
const MAX_CALLS = 50;

const text = (status: number, body: string): WebAnswer => ({
  status,
  type: 'text/plain',
  body,
});

/** "http://host:port/path?query" in parts, or null when it is not an http(s) address. */
export function parseUrl(
  url: string,
): { host: string; path: string; query: URLSearchParams } | null {
  const match = /^https?:\/\/([^/:?#]+)(?::\d+)?([^?#]*)(?:\?([^#]*))?/i.exec(url.trim());
  if (!match) return null;
  return {
    host: match[1]!.toLowerCase(),
    path: match[2] || '/',
    query: new URLSearchParams(match[3] ?? ''),
  };
}

/** A number from a name, the same every time, to make a city's weather its own. */
function seed(name: string): number {
  let hash = 2166136261;
  for (const char of name.toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 2 ** 32;
}

/**
 * Made-up weather: each city has its own warmth, and it drifts slowly over a
 * minute of lab time, so a program that asks again sees it change.
 */
export function madeUpWeather(city: string, timeMs: number) {
  const base = seed(city);
  const drift = Math.sin((timeMs / 60_000) * 2 * Math.PI + base * 6.28);
  const temperature = Math.round((22 + base * 12 + drift * 2) * 10) / 10;
  const humidity = Math.round(55 + base * 30 - drift * 5);
  return { city, temperature, humidity, madeUp: true };
}

export class LabWebServices {
  private readonly lines: string[] = [];
  private calls: WebCall[] = [];

  /** Answers a board's request, or null when no service has that name. */
  handle(request: {
    from: string;
    method: string;
    url: string;
    body: string;
    timeMs: number;
  }): WebAnswer | null {
    const method = request.method.toUpperCase();
    const body = request.body.slice(0, MAX_WEB_BODY);
    const address = parseUrl(request.url);
    const answer = address ? this.answer(method, address, body, request.timeMs) : null;
    this.calls.push({
      from: request.from,
      method,
      url: request.url.slice(0, 200),
      status: answer?.status ?? -1,
      timeMs: request.timeMs,
    });
    if (this.calls.length > MAX_CALLS) this.calls.splice(0, this.calls.length - MAX_CALLS);
    return answer;
  }

  /** The calls made since the last time this was asked, oldest first. */
  takeLog(): WebCall[] {
    const calls = this.calls;
    this.calls = [];
    return calls;
  }

  /** What log.lab holds, oldest first. */
  get logLines(): readonly string[] {
    return this.lines;
  }

  private answer(
    method: string,
    address: { host: string; path: string; query: URLSearchParams },
    body: string,
    timeMs: number,
  ): WebAnswer | null {
    const { host, path, query } = address;
    const search = query.toString();
    switch (host) {
      case 'echo.lab':
        return text(200, `${method} ${path}${search ? `?${search}` : ''}\n\n${body}`);

      case 'weather.lab': {
        if (method !== 'GET') return text(405, 'Use GET');
        if (path === '/') return text(200, 'Ask for /now?city=Dhaka');
        if (path !== '/now') return text(404, `Not found: ${path}`);
        const city = (query.get('city') ?? 'Dhaka').slice(0, 40) || 'Dhaka';
        return {
          status: 200,
          type: 'application/json',
          body: JSON.stringify(madeUpWeather(city, timeMs)),
        };
      }

      case 'log.lab': {
        if (method === 'POST' || method === 'PUT') {
          const line = body.replace(/\s+/g, ' ').trim().slice(0, 200);
          if (!line) return text(400, 'Send some text to keep');
          this.lines.push(line);
          if (this.lines.length > MAX_LOG_LINES) this.lines.shift();
          return text(201, `Kept: ${this.lines.length} lines`);
        }
        if (method === 'GET') return text(200, this.lines.slice(-20).join('\n'));
        if (method === 'DELETE') {
          this.lines.length = 0;
          return text(200, 'Cleared');
        }
        return text(405, 'Use GET or POST');
      }

      default:
        return null;
    }
  }
}

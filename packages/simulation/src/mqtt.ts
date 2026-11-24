/**
 * The lab's made-up MQTT broker: one for the whole circuit, shared by every
 * board and the dashboard panel. Messages arrive at once and in order; QoS,
 * sessions that outlive a disconnect, and the network are not modelled.
 */
export interface MqttMessage {
  topic: string;
  payload: string;
  /** Who sent it: a board's id, or "dashboard". */
  from: string;
  /** Session time it was sent, milliseconds. */
  timeMs: number;
}

/** The longest topic and payload kept, as on many small brokers. */
export const MAX_TOPIC = 256;
export const MAX_PAYLOAD = 4096;

/** True when an MQTT topic filter (with + and # wildcards) matches a topic. */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split('/');
  const t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return i === f.length - 1;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

/** A filter a client may subscribe with: # only last, wildcards only as whole levels. */
export function validFilter(filter: string): boolean {
  if (filter.length === 0 || filter.length > MAX_TOPIC) return false;
  const levels = filter.split('/');
  return levels.every(
    (level, i) =>
      (level === '#' ? i === levels.length - 1 : true) &&
      (level.includes('+') || level.includes('#') ? level.length === 1 : true),
  );
}

/** A topic a client may publish to: no wildcards. */
export const validTopic = (topic: string) =>
  topic.length > 0 && topic.length <= MAX_TOPIC && !/[+#]/.test(topic);

export class MqttBroker {
  /** The last retained message on each topic. */
  private readonly retained = new Map<string, MqttMessage>();
  /** Who is connected, and what each is subscribed to. */
  private readonly clients = new Map<
    string,
    { deliver(message: MqttMessage): void; filters: Set<string> }
  >();
  /** Everything sent since the last frame, for the dashboard. */
  private log: MqttMessage[] = [];

  connect(id: string, deliver: (message: MqttMessage) => void): void {
    this.clients.set(id, { deliver, filters: new Set() });
  }

  disconnect(id: string): void {
    this.clients.delete(id);
  }

  isConnected(id: string): boolean {
    return this.clients.has(id);
  }

  /** Subscribes, and hands over the retained messages the filter matches. */
  subscribe(id: string, filter: string): boolean {
    const client = this.clients.get(id);
    if (!client || !validFilter(filter)) return false;
    client.filters.add(filter);
    for (const message of this.retained.values()) {
      if (topicMatches(filter, message.topic)) client.deliver(message);
    }
    return true;
  }

  unsubscribe(id: string, filter: string): boolean {
    return this.clients.get(id)?.filters.delete(filter) ?? false;
  }

  publish(message: MqttMessage, retain = false): boolean {
    if (!validTopic(message.topic)) return false;
    const kept = { ...message, payload: message.payload.slice(0, MAX_PAYLOAD) };
    if (retain) {
      // An empty retained message clears the topic, as in MQTT.
      if (kept.payload === '') this.retained.delete(kept.topic);
      else this.retained.set(kept.topic, kept);
    }
    this.log.push(kept);
    for (const client of this.clients.values()) {
      if ([...client.filters].some((filter) => topicMatches(filter, kept.topic)))
        client.deliver(kept);
    }
    return true;
  }

  /** What was sent since the last call. */
  takeLog(): MqttMessage[] {
    const log = this.log;
    this.log = [];
    return log;
  }
}

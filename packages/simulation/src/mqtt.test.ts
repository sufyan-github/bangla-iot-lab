import { readFileSync } from 'node:fs';
import { esp32CircuitExample } from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { MqttBroker, topicMatches, validFilter, type MqttMessage } from './mqtt';
import { SimulationSession } from './session';

/** The lab's MQTT broker, and the ready-made program `mqtt` talking through it. */
const starter = (name: string) =>
  readFileSync(
    new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
    'utf8',
  );

describe('the lab’s MQTT broker', () => {
  it('matches topics with + and # as MQTT does', () => {
    expect(topicMatches('lab/+/temp', 'lab/room1/temp')).toBe(true);
    expect(topicMatches('lab/+/temp', 'lab/room1/hum')).toBe(false);
    expect(topicMatches('lab/#', 'lab/a/b/c')).toBe(true);
    expect(topicMatches('lab/#', 'lab')).toBe(true);
    expect(topicMatches('lab/a', 'lab/a/b')).toBe(false);
    expect(validFilter('lab/#/x')).toBe(false);
    expect(validFilter('lab/te+mp')).toBe(false);
  });

  it('delivers to matching subscribers, and keeps a retained message for later ones', () => {
    const broker = new MqttBroker();
    const got: string[] = [];
    broker.connect('a', (m) => got.push(`a:${m.topic}=${m.payload}`));
    broker.subscribe('a', 'lab/+');
    const message = (topic: string, payload: string): MqttMessage => ({
      topic,
      payload,
      from: 'x',
      timeMs: 0,
    });
    broker.publish(message('lab/one', '1'));
    broker.publish(message('other', '2'));
    broker.publish(message('lab/kept', 'yes'), true);
    broker.connect('b', (m) => got.push(`b:${m.topic}=${m.payload}`));
    broker.subscribe('b', 'lab/kept');
    expect(got).toEqual(['a:lab/one=1', 'a:lab/kept=yes', 'b:lab/kept=yes']);
    expect(broker.publish(message('lab/#', 'no'))).toBe(false);
  });
});

describe('MQTT on the ESP32', () => {
  it('the ready-made program sends the knob, and a message from the dashboard lights the LED', () => {
    const session = new SimulationSession(esp32CircuitExample());
    session.loadFirmware('ESP1', starter('mqtt'));
    const sent: MqttMessage[] = [];
    let serial = '';
    for (let i = 0; i < 40; i++) {
      session.advance(100);
      const frame = session.frame();
      sent.push(...(frame.mqtt ?? []));
      serial += frame.boards.ESP1?.serial ?? '';
    }
    expect(serial).toContain('ব্রোকারে যুক্ত হলাম');
    const knob = sent.filter((m) => m.topic === 'lab/knob' && m.from === 'ESP1');
    expect(knob.length).toBeGreaterThanOrEqual(1);
    expect(Number(knob[0]!.payload)).toBeGreaterThan(0);

    expect(session.publishMqtt('lab/led', 'on')).toBe(true);
    let lit = false;
    for (let i = 0; i < 10 && !lit; i++) {
      session.advance(100);
      const frame = session.frame();
      serial += frame.boards.ESP1?.serial ?? '';
      lit = frame.boards.ESP1!.drives[2] === 'high';
    }
    expect(serial).toContain('বার্তা এল lab/led: on');
    expect(lit).toBe(true);
  });
});

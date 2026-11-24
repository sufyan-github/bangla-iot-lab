import { useState } from 'react';
import { simulation } from '../sim/client';
import { useT } from '../i18n';
import { downloadText, toCsv } from './csv';
import { useLab, type MqttTopic } from './store';

/** A small line of a topic's recent numbers. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const points = values
    .map((value, i) => `${(i / (values.length - 1)) * 100},${28 - ((value - low) / span) * 24}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-28" aria-hidden preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-screen-ink)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * The IoT dashboard: every MQTT topic the boards and the dashboard use on the
 * lab's made-up broker, with its latest value, and a form to send a message.
 */
export function IotPanel() {
  const running = useLab((s) => s.running);
  const topics = useLab((s) => s.topics);
  const log = useLab((s) => s.mqttLog);
  const { t, number } = useT();
  const [topic, setTopic] = useState('lab/led');
  const [payload, setPayload] = useState('on');
  const [retained, setRetained] = useState(false);
  const [refused, setRefused] = useState(false);

  const send = async (text: string) => {
    const ok = await simulation().publishMqtt(topic.trim(), text, retained);
    setRefused(!ok);
  };

  if (!running) return <p className="px-4 py-4 text-sm text-ink-soft">{t('iot.idle')}</p>;
  const list = Object.values(topics).sort((a: MqttTopic, b: MqttTopic) =>
    a.topic.localeCompare(b.topic),
  );
  return (
    <div className="space-y-4 px-4 py-4" data-testid="iot-panel">
      <p className="text-sm text-ink-soft">{t('iot.about')}</p>
      {log.length > 0 && (
        <button
          type="button"
          data-testid="iot-csv"
          className="btn btn-secondary"
          onClick={() =>
            downloadText(
              'mqtt-log.csv',
              toCsv(
                ['time_s', 'from', 'topic', 'payload'],
                log.map((m) => [m.timeMs / 1000, m.from, m.topic, m.payload]),
              ),
            )
          }
        >
          {t('iot.csv', { count: number(log.length) })}
        </button>
      )}
      {list.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('iot.none')}</p>
      ) : (
        <ul className="screen divide-y divide-screen-line" data-testid="iot-topics">
          {list.map((item) => (
            <li
              key={item.topic}
              className="flex flex-wrap items-center gap-2 px-3 py-2"
              data-testid="iot-topic"
              data-topic={item.topic}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm text-chalk/85">{item.topic}</p>
                <p className="text-xs text-chalk/50">
                  {t('iot.from', {
                    from: item.from === 'dashboard' ? t('iot.dashboard') : item.from,
                    count: number(item.count),
                  })}
                </p>
              </div>
              <Sparkline values={item.history} />
              <span className="font-mono text-xl font-bold text-screen-ink" data-testid="iot-value">
                {item.payload.length > 24 ? `${item.payload.slice(0, 24)}…` : item.payload}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-2 rounded-[var(--radius-card)] border border-line bg-paper p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(payload);
        }}
      >
        <p className="font-semibold">{t('iot.send')}</p>
        <label className="block">
          <span className="mb-1 block text-sm text-ink-soft">{t('iot.topic')}</span>
          <input
            data-testid="iot-topic-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="field font-mono"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-ink-soft">{t('iot.message')}</span>
          <input
            data-testid="iot-payload"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="field font-mono"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={retained}
            onChange={(e) => setRetained(e.target.checked)}
            className="h-5 w-5 accent-amber"
          />
          {t('iot.retained')}
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" data-testid="iot-publish" className="btn btn-primary">
            {t('iot.publish')}
          </button>
          {['on', 'off'].map((quick) => (
            <button
              key={quick}
              type="button"
              data-testid={`iot-quick-${quick}`}
              onClick={() => void send(quick)}
              className="chip font-mono"
            >
              {quick}
            </button>
          ))}
        </div>
        {refused && (
          <p role="alert" className="text-sm font-medium text-danger">
            {t('iot.badTopic')}
          </p>
        )}
      </form>
    </div>
  );
}

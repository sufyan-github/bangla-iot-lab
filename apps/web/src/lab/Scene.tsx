import {
  BOARD_COLUMNS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  LED_COLORS,
  TERMINAL_ROWS,
  holeCoordinates,
  type CircuitComponent,
  type CircuitDocument,
} from '@banglalab/shared';
import type { BoardStatus, Reading, SimulationResult } from '@banglalab/simulation';
import { memo } from 'react';
import {
  BOARD_X,
  BOARD_Y,
  CANVAS_WIDTH,
  HOLE_POINTS,
  PITCH,
  batteryBox,
  batteryTerminalPoint,
  canvasHeight,
  endpointPoint,
  holePoint,
} from './geometry';
import {
  BatteryView,
  BuzzerView,
  ButtonView,
  CapacitorView,
  DiodeView,
  LED_PAINT,
  LdrView,
  LedView,
  MotorView,
  PotentiometerView,
  ResistorView,
  SensorView,
  SwitchView,
  TransistorView,
  UnoView,
  WireView,
} from './parts';

const rowY = (row: string) => BOARD_Y + holeCoordinates(`${row}1`).y * PITCH;

/** The empty breadboard on its mat. Never changes, so it renders once. */
const Board = memo(function Board({ detailed, height }: { detailed: boolean; height: number }) {
  const left = BOARD_X + PITCH * 0.4;
  const right = BOARD_X + (BOARD_WIDTH - 0.4) * PITCH;
  return (
    <g>
      <defs>
        <pattern id="mat-fine" width={PITCH} height={PITCH} patternUnits="userSpaceOnUse">
          <path d={`M${PITCH} 0H0V${PITCH}`} fill="none" stroke="#2a6c5f" strokeWidth={1} />
        </pattern>
        <pattern id="mat-coarse" width={PITCH * 5} height={PITCH * 5} patternUnits="userSpaceOnUse">
          <path
            d={`M${PITCH * 5} 0H0V${PITCH * 5}`}
            fill="none"
            stroke="#3a7f71"
            strokeWidth={1.5}
          />
        </pattern>
        {LED_COLORS.map((color) => (
          <radialGradient key={color} id={`glow-${color}`}>
            <stop offset="0" stopColor={LED_PAINT[color].glow} stopOpacity={0.95} />
            <stop offset="0.35" stopColor={LED_PAINT[color].glow} stopOpacity={0.5} />
            <stop offset="1" stopColor={LED_PAINT[color].glow} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
      <rect width={CANVAS_WIDTH} height={height} fill="#1d5a4e" />
      <rect width={CANVAS_WIDTH} height={height} fill="url(#mat-fine)" />
      <rect width={CANVAS_WIDTH} height={height} fill="url(#mat-coarse)" />

      <rect
        x={BOARD_X}
        y={BOARD_Y}
        width={BOARD_WIDTH * PITCH}
        height={BOARD_HEIGHT * PITCH}
        rx={9}
        fill="#efe9d8"
        stroke="#c9c0a4"
        strokeWidth={1.5}
      />
      <rect
        x={BOARD_X}
        y={rowY('e') + PITCH * 0.9}
        width={BOARD_WIDTH * PITCH}
        height={PITCH * 1.2}
        fill="#ddd5bd"
      />

      {/* Power rail markings: red for +, blue for −. */}
      {(['tp', 'bp'] as const).map((rail) => (
        <line
          key={rail}
          x1={left}
          x2={right}
          y1={rowY(rail) - PITCH * 0.5}
          y2={rowY(rail) - PITCH * 0.5}
          stroke="#d8342a"
          strokeWidth={2}
        />
      ))}
      {(['tn', 'bn'] as const).map((rail) => (
        <line
          key={rail}
          x1={left}
          x2={right}
          y1={rowY(rail) + PITCH * 0.5}
          y2={rowY(rail) + PITCH * 0.5}
          stroke="#2f6fd0"
          strokeWidth={2}
        />
      ))}
      {detailed && (
        <>
          <g fontSize={13} fontWeight={700} textAnchor="middle" pointerEvents="none">
            {(['tp', 'bp'] as const).map((rail) => (
              <text key={rail} x={BOARD_X + PITCH * 0.42} y={rowY(rail) + 4.5} fill="#d8342a">
                +
              </text>
            ))}
            {(['tn', 'bn'] as const).map((rail) => (
              <text key={rail} x={BOARD_X + PITCH * 0.42} y={rowY(rail) + 4.5} fill="#2f6fd0">
                −
              </text>
            ))}
          </g>

          <g fontSize={9.5} fill="#8b8468" textAnchor="middle" pointerEvents="none">
            {Array.from({ length: BOARD_COLUMNS }, (_, i) => i + 1)
              .filter((column) => column === 1 || column % 5 === 0)
              .flatMap((column) => [
                <text key={`t${column}`} x={BOARD_X + column * PITCH} y={rowY('a') - PITCH * 0.55}>
                  {column}
                </text>,
                <text key={`b${column}`} x={BOARD_X + column * PITCH} y={rowY('j') + PITCH * 0.85}>
                  {column}
                </text>,
              ])}
            {TERMINAL_ROWS.map((row) => (
              <text key={row} x={BOARD_X + PITCH * 0.42} y={rowY(row) + 3.5}>
                {row}
              </text>
            ))}
          </g>

          <g fill="#30332f">
            {HOLE_POINTS.map(({ hole, point }) => (
              <rect
                key={hole}
                x={point.x - 3.4}
                y={point.y - 3.4}
                width={6.8}
                height={6.8}
                rx={1.6}
              />
            ))}
          </g>
        </>
      )}
    </g>
  );
});

export interface SceneProps {
  circuit: CircuitDocument;
  result: SimulationResult | null;
  selectedId?: string | null;
  /** Push buttons being held down. */
  pressed?: readonly string[];
  /** Status of boards with a running program. */
  boards?: Record<string, BoardStatus>;
  /** False for thumbnails: leaves out the holes and lettering, which are invisible at that size. */
  detailed?: boolean;
  /** Text for a battery's label, e.g. "9 V". */
  batteryLabel(voltage: number): string;
  /** Text for the small reading shown beside a running part. */
  readingLabel?(amperes: number): string;
  /** Formats a plain number in the student's language; used on sensor modules. */
  formatNumber?(value: number): string;
}

/** Draws one part that plugs into the breadboard. */
function BoardPartDrawing(props: {
  part: Extract<CircuitComponent, { pins: unknown }>;
  reading: Reading | undefined;
  held: boolean;
  selected: boolean;
  formatNumber(value: number): string;
}) {
  const { part, reading, selected } = props;
  const at = holePoint;
  switch (part.type) {
    case 'resistor':
      return (
        <ResistorView
          a={at(part.pins.a)}
          b={at(part.pins.b)}
          resistance={part.props.resistance}
          selected={selected}
        />
      );
    case 'led':
      return (
        <LedView
          anode={at(part.pins.anode)}
          cathode={at(part.pins.cathode)}
          color={part.props.color}
          state={reading?.led?.state}
          brightness={reading?.led?.brightness ?? 0}
          selected={selected}
        />
      );
    case 'button':
      return (
        <ButtonView
          a={at(part.pins.a)}
          b={at(part.pins.b)}
          pressed={props.held}
          selected={selected}
        />
      );
    case 'switch':
      return (
        <SwitchView
          a={at(part.pins.a)}
          b={at(part.pins.b)}
          closed={part.props.closed}
          selected={selected}
        />
      );
    case 'capacitor':
      return <CapacitorView a={at(part.pins.a)} b={at(part.pins.b)} selected={selected} />;
    case 'diode':
      return (
        <DiodeView
          anode={at(part.pins.anode)}
          cathode={at(part.pins.cathode)}
          selected={selected}
        />
      );
    case 'ldr':
      return (
        <LdrView
          a={at(part.pins.a)}
          b={at(part.pins.b)}
          light={part.props.light}
          selected={selected}
        />
      );
    case 'buzzer':
      return (
        <BuzzerView
          pos={at(part.pins.pos)}
          neg={at(part.pins.neg)}
          sounding={reading?.activity === 1}
          selected={selected}
        />
      );
    case 'motor':
      return (
        <MotorView
          a={at(part.pins.a)}
          b={at(part.pins.b)}
          speed={reading?.activity ?? 0}
          selected={selected}
        />
      );
    case 'potentiometer':
      return (
        <PotentiometerView
          a={at(part.pins.a)}
          wiper={at(part.pins.wiper)}
          b={at(part.pins.b)}
          position={part.props.position}
          selected={selected}
        />
      );
    case 'transistor':
      return (
        <TransistorView
          collector={at(part.pins.collector)}
          emitter={at(part.pins.emitter)}
          selected={selected}
        />
      );
    case 'temperature':
      return (
        <SensorView
          kind="temperature"
          vcc={at(part.pins.vcc)}
          gnd={at(part.pins.gnd)}
          label={`${props.formatNumber(part.props.celsius)}°C`}
          selected={selected}
        />
      );
    case 'soil':
      return (
        <SensorView
          kind="soil"
          vcc={at(part.pins.vcc)}
          gnd={at(part.pins.gnd)}
          label={`${props.formatNumber(Math.round(part.props.moisture * 100))}%`}
          selected={selected}
        />
      );
    case 'ir':
      return (
        <SensorView
          kind="ir"
          vcc={at(part.pins.vcc)}
          gnd={at(part.pins.gnd)}
          label="IR"
          lit={part.props.detected}
          selected={selected}
        />
      );
  }
}

/**
 * Draws a circuit: board, batteries, parts and wires. Purely presentational,
 * so the same component renders the editor canvas and project thumbnails.
 */
export function Scene({
  circuit,
  result,
  selectedId,
  pressed = [],
  boards = {},
  detailed = true,
  batteryLabel,
  readingLabel,
  formatNumber = String,
}: SceneProps) {
  let batteryCount = 0;
  return (
    <>
      <Board detailed={detailed} height={canvasHeight(circuit)} />
      {circuit.components.map((component) => {
        const selected = component.id === selectedId;
        const reading = result?.readings[component.id];
        if (component.type === 'battery') {
          const index = batteryCount++;
          return (
            <g key={component.id} data-part={component.id}>
              <BatteryView
                box={batteryBox(index)}
                label={batteryLabel(component.props.voltage)}
                positive={batteryTerminalPoint(index, 'pos')}
                negative={batteryTerminalPoint(index, 'neg')}
                selected={selected}
              />
            </g>
          );
        }
        if (component.type === 'uno') {
          return (
            <g key={component.id} data-part={component.id}>
              <UnoView
                ledLevel={boards[component.id]?.highFraction[13] ?? 0}
                powered={result !== null}
                selected={selected}
              />
            </g>
          );
        }
        const held = pressed.includes(component.id);
        return (
          <g
            key={component.id}
            data-part={component.id}
            data-pressed={component.type === 'button' ? held : undefined}
            data-led-state={component.type === 'led' ? (reading?.led?.state ?? 'idle') : undefined}
            data-current-ma={reading ? (reading.current * 1000).toFixed(2) : undefined}
            data-voltage={reading ? reading.voltage.toFixed(3) : undefined}
            data-activity={reading?.activity?.toFixed(2)}
          >
            <BoardPartDrawing
              part={component}
              reading={reading}
              held={held}
              selected={selected}
              formatNumber={formatNumber}
            />
          </g>
        );
      })}

      {circuit.wires.map((wire) => {
        const from = endpointPoint(circuit, wire.from);
        const to = endpointPoint(circuit, wire.to);
        if (!from || !to) return null;
        return (
          <g key={wire.id} data-wire={wire.id}>
            <WireView
              from={from}
              to={to}
              color={wire.color}
              current={result?.wireCurrents[wire.id]}
              selected={wire.id === selectedId}
            />
          </g>
        );
      })}

      {result && readingLabel && (
        <g pointerEvents="none" fontSize={11.5} fontWeight={600} textAnchor="middle">
          {circuit.components.map((component) => {
            const reading = result.readings[component.id];
            if (!reading || (component.type !== 'resistor' && component.type !== 'led'))
              return null;
            const [first, second] = Object.values(component.pins).map(holePoint) as [
              { x: number; y: number },
              { x: number; y: number },
            ];
            const text = readingLabel(reading.current);
            const x = (first.x + second.x) / 2;
            // Resistor readings sit above the part and LED readings below, so the
            // labels of neighbouring parts do not cover each other.
            const y =
              component.type === 'led'
                ? Math.max(first.y, second.y) + 34
                : Math.min(first.y, second.y) - 22;
            const width = text.length * 6.6 + 12;
            return (
              <g key={component.id}>
                <rect
                  x={x - width / 2}
                  y={y - 12}
                  width={width}
                  height={17}
                  rx={5}
                  fill="#13231f"
                  opacity={0.88}
                />
                <text x={x} y={y + 0.5} fill="#f4f7f5">
                  {text}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </>
  );
}

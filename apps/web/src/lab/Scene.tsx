import {
  BREADBOARD_SPECS,
  LED_COLORS,
  TERMINAL_ROWS,
  holesOf,
  layoutOf,
  localCoordinates,
  parseHole,
  type CircuitComponent,
  type CircuitDocument,
} from '@banglalab/shared';
import {
  ESP32_LED_GPIO,
  type BoardStatus,
  type Reading,
  type SimulationResult,
} from '@banglalab/simulation';
import { memo } from 'react';
import { DRIVER_TERMINAL_NAMES } from './endpoints';
import {
  BREADBOARD_TAB,
  DRIVER_TERMINALS,
  PITCH,
  batteryTerminalPoint,
  breadboardBox,
  canvasHeight,
  canvasWidth,
  endpointPoint,
  holePoint,
  partBox,
  boardShift,
  wireBends,
  type Point,
} from './geometry';
import {
  Acs712View,
  Ds18b20View,
  GpsView,
  BluetoothView,
  Mp3View,
  GsmView,
  LedRingView,
  LoraView,
  TftView,
  PmsView,
  LineSensorView,
  SirenView,
  Bme280View,
  Ina219View,
  CellView,
  Lm2596View,
  SolarView,
  Tp4056View,
  AnalogModuleView,
  BatteryView,
  BuzzerView,
  ButtonView,
  CapacitorView,
  ChipView,
  DiodeView,
  LED_PAINT,
  LcdView,
  LdrView,
  LedView,
  MotorDriverView,
  MotorView,
  OledView,
  PirView,
  ClockView,
  SevenSegmentView,
  PotentiometerView,
  RelayModuleView,
  RelayView,
  ResistorView,
  RgbLedView,
  SensorView,
  ServoView,
  SwitchView,
  TransistorView,
  UltrasonicView,
  UnoView,
  WireView,
} from './parts';
import { Esp32BoardView } from './esp32/Esp32BoardView';
import { oledImage } from './oled-image';
import { tftImage } from './tft-image';
import { ShadingDefs } from './shading';

/** The mat the breadboards lie on, and the patterns and colours the drawings share. */
const Mat = memo(function Mat({ width, height }: { width: number; height: number }) {
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
        <ShadingDefs />
        <pattern id="mesh" width={2.6} height={2.6} patternUnits="userSpaceOnUse">
          <path d="M0 1.3H2.6M1.3 0V2.6" stroke="#9aa3a7" strokeWidth={0.45} />
        </pattern>
        {LED_COLORS.map((color) => (
          <radialGradient key={color} id={`glow-${color}`}>
            <stop offset="0" stopColor={LED_PAINT[color].glow} stopOpacity={0.95} />
            <stop offset="0.35" stopColor={LED_PAINT[color].glow} stopOpacity={0.5} />
            <stop offset="1" stopColor={LED_PAINT[color].glow} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
      <rect width={width} height={height} fill="#1d5a4e" />
      <rect width={width} height={height} fill="url(#mat-fine)" />
      <rect width={width} height={height} fill="url(#mat-coarse)" />
    </g>
  );
});

/**
 * One empty breadboard, with its name on a tab above its corner. Drawn at its
 * own corner, so the same drawing serves wherever it is moved.
 */
const BreadboardDrawing = memo(function BreadboardDrawing(props: {
  id: string;
  size: 'half' | 'full' | 'mini';
  x: number;
  y: number;
  detailed: boolean;
  selected: boolean;
}) {
  const spec = BREADBOARD_SPECS[props.size];
  const width = spec.width * PITCH;
  const height = spec.height * PITCH;
  const rowY = (row: keyof typeof spec.rowY) => (spec.rowY[row] ?? 0) * PITCH;
  const left = PITCH * 0.4;
  const right = (spec.width - 0.4) * PITCH;
  const holes = holesOf(props.id, props.size).map((hole) => {
    const at = localCoordinates(parseHole(hole)!, props.size);
    return { hole, x: at.x * PITCH, y: at.y * PITCH };
  });
  const rails = spec.rails;
  return (
    <g transform={`translate(${props.x} ${props.y})`} data-breadboard={props.id}>
      {/* The tab it is picked up by, with its name. */}
      <rect
        x={0}
        y={-BREADBOARD_TAB.height}
        width={BREADBOARD_TAB.width}
        height={BREADBOARD_TAB.height + 8}
        rx={6}
        fill={props.selected ? '#e8a21a' : '#cfc6aa'}
      />
      {props.detailed && (
        <text
          x={BREADBOARD_TAB.width / 2}
          y={-6}
          fontSize={11.5}
          fontWeight={700}
          fill="#3d3a2c"
          textAnchor="middle"
          pointerEvents="none"
        >
          ⠿ {props.id}
        </text>
      )}
      {/* The board casts a soft shadow on the mat and has a lit top edge. */}
      <rect x={2} y={6} width={width} height={height} rx={10} fill="#0d3129" opacity={0.55} />
      <rect
        width={width}
        height={height}
        rx={9}
        fill="#efe9d8"
        stroke={props.selected ? '#e8a21a' : '#c9c0a4'}
        strokeWidth={props.selected ? 3 : 1.5}
      />
      <rect x={6} y={1.5} width={width - 12} height={2} rx={1} fill="#fffdf4" opacity={0.9} />
      {/* The trench down the middle, where chips straddle the two halves. */}
      <rect y={rowY('e') + PITCH * 0.9} width={width} height={PITCH * 1.2} fill="#ddd5bd" />
      <rect y={rowY('e') + PITCH * 0.9} width={width} height={2.5} fill="#c4bb9f" />

      {/* Power rail markings: red for +, blue for −. */}
      {rails &&
        (['tp', 'bp'] as const).map((rail) => (
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
      {rails &&
        (['tn', 'bn'] as const).map((rail) => (
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
      {props.detailed && (
        <>
          {rails && (
            <g fontSize={13} fontWeight={700} textAnchor="middle" pointerEvents="none">
              {(['tp', 'bp'] as const).map((rail) => (
                <text key={rail} x={PITCH * 0.42} y={rowY(rail) + 4.5} fill="#d8342a">
                  +
                </text>
              ))}
              {(['tn', 'bn'] as const).map((rail) => (
                <text key={rail} x={PITCH * 0.42} y={rowY(rail) + 4.5} fill="#2f6fd0">
                  −
                </text>
              ))}
            </g>
          )}

          <g fontSize={9.5} fill="#8b8468" textAnchor="middle" pointerEvents="none">
            {Array.from({ length: spec.columns }, (_, i) => i + 1)
              .filter((column) => column === 1 || column % 5 === 0)
              .flatMap((column) => [
                <text key={`t${column}`} x={column * PITCH} y={rowY('a') - PITCH * 0.55}>
                  {column}
                </text>,
                <text key={`b${column}`} x={column * PITCH} y={rowY('j') + PITCH * 0.85}>
                  {column}
                </text>,
              ])}
            {TERMINAL_ROWS.map((row) => (
              <text key={row} x={PITCH * 0.42} y={rowY(row) + 3.5}>
                {row}
              </text>
            ))}
          </g>

          {/* Each hole: a bevelled rim, then the dark opening with a glint of the metal clip. */}
          <g fill="#d6ceb4">
            {holes.map(({ hole, x, y }) => (
              <rect key={hole} x={x - 4.6} y={y - 4.6} width={9.2} height={9.2} rx={2.4} />
            ))}
          </g>
          <g fill="#2a2d29">
            {holes.map(({ hole, x, y }) => (
              <rect key={hole} x={x - 3.4} y={y - 3.4} width={6.8} height={6.8} rx={1.6} />
            ))}
          </g>
          <g fill="#6f7a78">
            {holes.map(({ hole, x, y }) => (
              <rect key={hole} x={x - 1.3} y={y + 0.9} width={2.6} height={1.3} rx={0.6} />
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
  /**
   * A part being carried: it is drawn this far from the holes it would drop
   * into, so it follows the hand smoothly instead of jumping hole to hole.
   */
  lift?: { id: string; x: number; y: number } | null;
  /**
   * A lead or wire end being carried: `key` is the lead's name, or `from`/`to`
   * for a wire, and it is drawn at `point` until it is let go.
   */
  floating?: { id: string; key: string; point: Point } | null;
}

/** Draws one part that plugs into the breadboard. */
export function BoardPartDrawing(props: {
  part: Extract<CircuitComponent, { pins: unknown }>;
  reading: Reading | undefined;
  held: boolean;
  selected: boolean;
  formatNumber(value: number): string;
  /** Where a hole is drawn: on its breadboard, or in the hand for a lead being carried. */
  pointOf(hole: string): Point;
}) {
  const { part, reading, selected } = props;
  const at = props.pointOf;
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
    case 'bme280':
      return (
        <Bme280View
          first={at(part.pins.vcc)}
          last={at(part.pins.sda)}
          label={`${props.formatNumber(part.props.celsius)}°`}
          selected={selected}
        />
      );
    case 'ina219':
      return <Ina219View first={at(part.pins.vcc)} last={at(part.pins.vinp)} selected={selected} />;
    case 'cell':
      return (
        <CellView
          pos={at(part.pins.pos)}
          neg={at(part.pins.neg)}
          label={`${props.formatNumber(Math.round(part.props.charge * 100))}%`}
          selected={selected}
        />
      );
    case 'solar':
      return (
        <SolarView
          pos={at(part.pins.pos)}
          neg={at(part.pins.neg)}
          light={part.props.light}
          selected={selected}
        />
      );
    case 'tp4056':
      return (
        <Tp4056View
          first={at(part.pins.inp)}
          last={at(part.pins.outn)}
          state={reading?.activity ?? 0}
          selected={selected}
        />
      );
    case 'lm2596':
      return (
        <Lm2596View
          first={at(part.pins.inp)}
          last={at(part.pins.outp)}
          label={`${props.formatNumber(part.props.volts)} V`}
          lit={reading?.activity === 1}
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
    case 'servo':
      return (
        <ServoView
          gnd={at(part.pins.gnd)}
          signal={at(part.pins.signal)}
          angle={reading?.angle}
          selected={selected}
        />
      );
    case 'bluetooth':
      return (
        <BluetoothView
          first={at(part.pins.vcc)}
          last={at(part.pins.rx)}
          connected={part.props.paired && !!reading?.phone?.connected}
          selected={selected}
        />
      );
    case 'mp3':
      return (
        <Mp3View
          first={at(part.pins.vcc)}
          last={at(part.pins.gnd)}
          playing={!!reading?.player?.playing}
          selected={selected}
        />
      );
    case 'gsm':
      return (
        <GsmView
          first={at(part.pins.vcc)}
          last={at(part.pins.gnd)}
          registered={!!reading?.network?.registered}
          selected={selected}
        />
      );
    case 'gps':
      return (
        <GpsView
          first={at(part.pins.vcc)}
          last={at(part.pins.gnd)}
          fix={part.props.fix}
          selected={selected}
        />
      );
    case 'pms5003':
      return (
        <PmsView
          first={at(part.pins.vcc)}
          last={at(part.pins.tx)}
          label={props.formatNumber(part.props.pm25)}
          selected={selected}
        />
      );
    case 'ds18b20':
      return (
        <Ds18b20View
          first={at(part.pins.gnd)}
          last={at(part.pins.vdd)}
          label={`${props.formatNumber(part.props.celsius)}°`}
          selected={selected}
        />
      );
    case 'linesensor':
      return (
        <LineSensorView
          first={at(part.pins.gnd)}
          last={at(part.pins.s5)}
          black={part.props.black}
          selected={selected}
        />
      );
    case 'siren':
      return (
        <SirenView
          pos={at(part.pins.pos)}
          neg={at(part.pins.neg)}
          sounding={reading?.activity === 1}
          selected={selected}
        />
      );
    case 'jsnsr04t':
    case 'ultrasonic':
      return (
        <UltrasonicView
          vcc={at(part.pins.vcc)}
          gnd={at(part.pins.gnd)}
          label={`${props.formatNumber(part.props.distance)} cm`}
          selected={selected}
        />
      );
    case 'lcd':
      return (
        <LcdView
          first={at(part.pins.vss)}
          last={at(part.pins.k)}
          lines={reading?.lcd?.lines}
          selected={selected}
        />
      );
    case 'logic':
      return (
        <ChipView
          p1={at(part.pins.p1!)}
          p7={at(part.pins.p7!)}
          p14={at(part.pins.p14!)}
          name={part.props.chip}
          selected={selected}
        />
      );
    case 'logic16':
      return (
        <ChipView
          p1={at(part.pins.p1!)}
          p7={at(part.pins.p8!)}
          p14={at(part.pins.p16!)}
          perSide={8}
          name={part.props.chip}
          selected={selected}
        />
      );
    case 'sevenseg':
      return (
        <SevenSegmentView
          e={at(part.pins.e)}
          dp={at(part.pins.dp)}
          g={at(part.pins.g)}
          segments={reading?.segments}
          state={reading?.led?.state}
          selected={selected}
        />
      );
    case 'relaymodule':
      return (
        <RelayModuleView
          first={at(part.pins.vcc)}
          last={at(part.pins.nc)}
          closed={reading?.activity === 1}
          powered={(reading?.voltage ?? 0) > 2}
          trigger={part.props.trigger}
          selected={selected}
        />
      );
    case 'relay':
      return (
        <RelayView
          first={at(part.pins.coil1)}
          last={at(part.pins.no)}
          closed={reading?.activity === 1}
          selected={selected}
        />
      );
    case 'dht11':
      return (
        <SensorView
          kind="dht11"
          vcc={at(part.pins.vcc)}
          gnd={at(part.pins.gnd)}
          label={`${props.formatNumber(part.props.celsius)}° ${props.formatNumber(part.props.humidity)}%`}
          selected={selected}
        />
      );
    case 'ldrmodule':
    case 'rain':
    case 'mq135':
    case 'mq7':
    case 'ph': {
      const label =
        part.type === 'ph'
          ? `pH ${props.formatNumber(part.props.ph)}`
          : `${props.formatNumber(
              Math.round(
                (part.type === 'ldrmodule'
                  ? part.props.light
                  : part.type === 'rain'
                    ? part.props.wetness
                    : part.type === 'mq7'
                      ? part.props.co
                      : part.props.gas) * 100,
              ),
            )}%`;
      return (
        <AnalogModuleView
          kind={part.type}
          first={at(part.pins.vcc)}
          last={at(part.pins.ao)}
          label={label}
          lit={reading?.activity === 1}
          selected={selected}
        />
      );
    }
    case 'oled': {
      const shown = reading?.oled;
      return (
        <OledView
          first={at(part.pins.gnd)}
          last={at(part.pins.sda)}
          image={shown?.pixels ? oledImage(shown.pixels, shown.brightness).url : undefined}
          selected={selected}
        />
      );
    }
    case 'ledring':
      return (
        <LedRingView
          first={at(part.pins.vcc)}
          last={at(part.pins.dout)}
          colours={reading?.ring?.colours ?? []}
          leds={part.props.leds}
          selected={selected}
        />
      );
    case 'lora':
      return (
        <LoraView
          first={at(part.pins.gnd)}
          last={at(part.pins.sck)}
          mode={reading?.radio?.mode}
          selected={selected}
        />
      );
    case 'tft': {
      const shown = reading?.tft;
      return (
        <TftView
          first={at(part.pins.gnd)}
          last={at(part.pins.blk)}
          image={shown?.pixels ? tftImage(shown.pixels).url : undefined}
          lit={!!shown?.lit}
          selected={selected}
        />
      );
    }
    case 'clock':
      return (
        <ClockView
          vcc={at(part.pins.vcc)}
          gnd={at(part.pins.gnd)}
          high={reading?.activity === 1}
          hz={part.props.hz}
          selected={selected}
        />
      );
    case 'pir':
      return (
        <PirView
          vcc={at(part.pins.vcc)}
          gnd={at(part.pins.gnd)}
          motion={part.props.motion}
          high={reading?.activity === 1}
          selected={selected}
        />
      );
    case 'rgbled':
      return (
        <RgbLedView
          first={at(part.pins.r)}
          last={at(part.pins.gnd)}
          mix={reading?.rgb}
          state={reading?.led?.state}
          selected={selected}
        />
      );
    case 'voltagesensor':
      return (
        <SensorView
          kind="voltagesensor"
          vcc={at(part.pins.vin)}
          gnd={at(part.pins.s)}
          label="0–25V"
          selected={selected}
        />
      );
    case 'tds':
    case 'turbidity':
      return (
        <SensorView
          kind={part.type}
          vcc={at(part.pins.out)}
          gnd={at(part.pins.gnd)}
          label={
            part.type === 'tds'
              ? `${props.formatNumber(part.props.ppm)} ppm`
              : `${props.formatNumber(part.props.ntu)} NTU`
          }
          selected={selected}
        />
      );
    case 'acs712':
      return (
        <Acs712View
          first={at(part.pins.ip1)}
          last={at(part.pins.gnd)}
          label={part.props.range}
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
  lift = null,
  floating = null,
}: SceneProps) {
  /** Style for the layer of a part: it glides back into place when it is let go. */
  const layerStyle = (id: string) =>
    lift?.id === id
      ? { transform: `translate(${lift.x}px, ${lift.y}px)`, transition: 'none' }
      : undefined;
  return (
    <>
      <Mat width={canvasWidth(circuit)} height={canvasHeight(circuit)} />
      {layoutOf(circuit).boards.map((board) => {
        const box = breadboardBox(board);
        return (
          <g key={board.id}>
            <BreadboardDrawing
              id={board.id}
              size={board.size}
              x={box.x}
              y={box.y}
              detailed={detailed}
              selected={board.id === selectedId}
            />
          </g>
        );
      })}
      {circuit.components.map((component) => {
        const selected = component.id === selectedId;
        const reading = result?.readings[component.id];
        if (component.type === 'breadboard') return null;
        if (component.type === 'battery') {
          const box = partBox(circuit, component);
          return (
            <g key={component.id} data-part={component.id}>
              <BatteryView
                box={box}
                label={batteryLabel(component.props.voltage)}
                pack={component.props.voltage === 7.2}
                positive={batteryTerminalPoint(box, 'pos')}
                negative={batteryTerminalPoint(box, 'neg')}
                selected={selected}
              />
            </g>
          );
        }
        if (component.type === 'l298n') {
          return (
            <g key={component.id} data-part={component.id} data-awake={reading?.activity === 1}>
              <MotorDriverView
                box={partBox(circuit, component)}
                terminals={DRIVER_TERMINALS.map(({ terminal, at }) => ({
                  terminal,
                  at,
                  name: DRIVER_TERMINAL_NAMES[terminal] ?? terminal,
                }))}
                jumpers={{ ena: component.props.enaJumper, enb: component.props.enbJumper }}
                awake={reading?.activity === 1}
                selected={selected}
              />
            </g>
          );
        }
        if (component.type === 'esp32') {
          const box = partBox(circuit, component);
          return (
            <g
              key={component.id}
              data-part={component.id}
              transform={`translate(${box.x} ${box.y})`}
            >
              <Esp32BoardView
                ledLevel={boards[component.id]?.highFraction[ESP32_LED_GPIO] ?? 0}
                powered={result !== null}
                selected={selected}
              />
            </g>
          );
        }
        if (component.type === 'uno') {
          const shift = boardShift(circuit, component);
          return (
            <g
              key={component.id}
              data-part={component.id}
              transform={`translate(${shift.x} ${shift.y})`}
            >
              <UnoView
                ledLevel={boards[component.id]?.highFraction[13] ?? 0}
                powered={result !== null}
                selected={selected}
              />
            </g>
          );
        }
        const held = pressed.includes(component.id);
        const carried = floating?.id === component.id ? floating : null;
        const carriedHole = carried
          ? (component.pins as Record<string, string>)[carried.key]
          : undefined;
        return (
          <g
            key={component.id}
            className={lift?.id === component.id ? 'part-layer part-lifted' : 'part-layer'}
            style={layerStyle(component.id)}
            data-part={component.id}
            data-pressed={component.type === 'button' ? held : undefined}
            data-led-state={
              component.type === 'led' || component.type === 'rgbled'
                ? (reading?.led?.state ?? 'idle')
                : undefined
            }
            data-oled={
              reading?.oled &&
              (reading.oled.pixels
                ? oledImage(reading.oled.pixels, reading.oled.brightness).litPixels
                : 'dark')
            }
            data-tft={
              reading?.tft && (reading.tft.pixels ? tftImage(reading.tft.pixels).litPixels : 'dark')
            }
            data-radio={
              reading?.radio &&
              `${reading.radio.mode}:${reading.radio.sent}:${reading.radio.received}`
            }
            data-ring={reading?.ring?.colours
              .map((colour) => colour.toString(16).padStart(6, '0'))
              .join(',')}
            data-colours={
              reading?.rgb &&
              (['r', 'g', 'b'] as const).filter((c) => reading.rgb![c] > 0.05).join('')
            }
            data-current-ma={reading ? (reading.current * 1000).toFixed(2) : undefined}
            data-voltage={reading ? reading.voltage.toFixed(3) : undefined}
            data-activity={reading?.activity?.toFixed(2)}
            data-angle={reading?.angle?.toFixed(0)}
            data-lcd={reading?.lcd?.lines.join('|')}
          >
            <BoardPartDrawing
              part={component}
              reading={reading}
              held={held}
              selected={selected}
              formatNumber={formatNumber}
              pointOf={(hole) =>
                carried && hole === carriedHole ? carried.point : holePoint(circuit, hole)
              }
            />
          </g>
        );
      })}

      {circuit.wires.map((wire) => {
        const carried = floating?.id === wire.id ? floating : null;
        const from = carried?.key === 'from' ? carried.point : endpointPoint(circuit, wire.from);
        const to = carried?.key === 'to' ? carried.point : endpointPoint(circuit, wire.to);
        if (!from || !to) return null;
        return (
          <g key={wire.id} data-wire={wire.id}>
            <WireView
              from={from}
              to={to}
              color={wire.color}
              current={result?.wireCurrents[wire.id]}
              selected={wire.id === selectedId}
              lifted={carried !== null}
              bends={wireBends(wire)}
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
            const [first, second] = Object.values(component.pins).map((hole) =>
              holePoint(circuit, hole),
            ) as [{ x: number; y: number }, { x: number; y: number }];
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

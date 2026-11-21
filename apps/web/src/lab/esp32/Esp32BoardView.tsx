import type { Box } from '../units';
import {
  ESP32_DEFAULT_VARIANT,
  UNITS_PER_MM,
  esp32BoardLayout,
  type Esp32BoardVariantId,
} from './geometry';

/**
 * The 30-pin ESP32 development board seen from above. Pure SVG: no state, no
 * event handling. Drawn from its own top-left corner; the caller places it
 * with a transform. It uses the shading gradients of `../shading`, which the
 * scene defines once.
 *
 * Not yet used by the editor.
 */

const SELECTION = '#e8a21a';
const SILK = '#e6ecee';
const GOLD = '#d9b65c';
const METAL_EDGE = '#70797d';
const BOARD = '#1d2529';
const BOARD_EDGE = '#0c1113';
const TRACE = '#27333a';

const mm = (value: number) => value * UNITS_PER_MM;

/** A push button: a metal frame with a round black cap. */
function Button({ box, label, labelY }: { box: Box; label: string; labelY: number }) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return (
    <g>
      <rect {...box} rx={2} fill="url(#shade-metal)" stroke={METAL_EDGE} />
      <circle cx={cx} cy={cy} r={box.width * 0.3} fill="#16191b" />
      <circle cx={cx} cy={cy} r={box.width * 0.3} fill="url(#shade-dome)" opacity={0.55} />
      <text x={cx} y={labelY} textAnchor="middle" fontSize={8} fontWeight={600} fill={SILK}>
        {label}
      </text>
    </g>
  );
}

/** A small surface-mount LED with its printed name, glowing in proportion to `level`. */
function Light(props: {
  x: number;
  y: number;
  label: string;
  off: string;
  on: string;
  level: number;
}) {
  const { x, y, level } = props;
  return (
    <g>
      {level > 0 && <circle cx={x} cy={y} r={15} fill={props.on} opacity={0.42 * level} />}
      <rect x={x - 7.5} y={y - 4} width={15} height={8} rx={1} fill="#c9ced0" />
      <rect x={x - 4.5} y={y - 4} width={9} height={8} rx={1.5} fill={props.off} />
      <rect x={x - 4.5} y={y - 4} width={9} height={8} rx={1.5} fill={props.on} opacity={level} />
      <text x={x + 11} y={y + 3} fontSize={7.5} fontWeight={600} fill={SILK}>
        {props.label}
      </text>
    </g>
  );
}

export function Esp32BoardView(props: {
  /** Brightness of the LED on GPIO2, 0 to 1. */
  ledLevel: number;
  powered: boolean;
  selected: boolean;
  variant?: Esp32BoardVariantId;
}) {
  const layout = esp32BoardLayout(props.variant ?? ESP32_DEFAULT_VARIANT);
  const { width, height, module, shield, antenna, usb, regulator, usbBridge } = layout;
  const middle = height / 2;
  const rowY = {
    top: layout.pins.find((pin) => pin.row === 'top')!.point.y,
    bottom: layout.pins.find((pin) => pin.row === 'bottom')!.point.y,
  };
  const firstX = Math.min(...layout.pins.map((pin) => pin.point.x));
  const lastX = Math.max(...layout.pins.map((pin) => pin.point.x));
  // The module's solder pads: 14 along each long edge and 10 across the end, 1.27 mm apart.
  const edgePads = Array.from({ length: 14 }, (_, i) => module.x + mm(1.5 + i * 1.27));
  const endPads = Array.from({ length: 10 }, (_, i) => middle + mm((i - 4.5) * 1.27));
  // The antenna: a copper track folded back and forth on the bare end of the module.
  const folds = 5;
  const step = antenna.height / folds;
  const meander = Array.from({ length: folds }, (_, i) => {
    const y = antenna.y + i * step;
    const [near, far] =
      i % 2 === 0 ? [antenna.x, antenna.x + antenna.width] : [antenna.x + antenna.width, antenna.x];
    return `${i === 0 ? 'M' : 'L'}${near} ${y}H${far}V${y + step}`;
  }).join('');

  return (
    <g>
      {props.selected && (
        <rect
          x={-6}
          y={-6}
          width={width + 12}
          height={height + 12}
          rx={12}
          fill={SELECTION}
          opacity={0.4}
        />
      )}
      {/* The board: a soft shadow, black solder mask, a gloss across it. */}
      <rect x={3} y={6} width={width} height={height} rx={6} fill="#000" opacity={0.3} />
      <rect width={width} height={height} rx={6} fill={BOARD} />
      <rect width={width} height={height} rx={6} fill="url(#shade-board)" />
      <rect width={width} height={height} rx={6} fill="none" stroke={BOARD_EDGE} strokeWidth={2} />

      {/* Copper tracks under the solder mask. */}
      <path
        d={`M${usb.x + usb.width} ${middle}H${regulator.x}M${regulator.x + regulator.width} ${middle - mm(3)}H${module.x}M${usbBridge.x + usbBridge.width} ${middle}H${module.x}M${usbBridge.x + mm(2.6)} ${usbBridge.y}V${rowY.top + 26}M${usbBridge.x + mm(2.6)} ${usbBridge.y + usbBridge.height}V${rowY.bottom - 26}`}
        fill="none"
        stroke={TRACE}
        strokeWidth={2.2}
      />

      {/* The two pin headers: a printed outline, and each pin soldered through its gold pad. */}
      {(['top', 'bottom'] as const).map((row) => (
        <rect
          key={row}
          x={firstX - 12}
          y={rowY[row] - 11}
          width={lastX - firstX + 24}
          height={22}
          rx={2}
          fill="#11171a"
          stroke={SILK}
          strokeOpacity={0.35}
          strokeWidth={0.8}
        />
      ))}
      {layout.pins.map(({ id, label, row, point }) => (
        <g key={id}>
          <circle cx={point.x} cy={point.y} r={7.2} fill={GOLD} />
          <circle
            cx={point.x}
            cy={point.y}
            r={4.3}
            fill="url(#shade-metal)"
            stroke="rgba(0,0,0,.45)"
            strokeWidth={0.7}
          />
          <text
            x={point.x}
            y={point.y + (row === 'top' ? 18.6 : -12.4)}
            textAnchor="middle"
            fontSize={8.4}
            fontWeight={700}
            fill={SILK}
          >
            {label}
          </text>
        </g>
      ))}

      {/* USB socket: a metal shell overhanging the edge, with its dark opening. */}
      <rect {...usb} rx={3} fill="url(#shade-metal)" stroke={METAL_EDGE} />
      <rect
        x={usb.x}
        y={usb.y + usb.height * 0.2}
        width={8}
        height={usb.height * 0.6}
        fill="#23282a"
      />

      <Button
        box={layout.enButton}
        label="EN"
        labelY={layout.enButton.y + layout.enButton.height + 10}
      />
      <Button box={layout.bootButton} label="BOOT" labelY={layout.bootButton.y - 4} />

      {/* The 3.3 V regulator: a black body, three legs and a wide metal tab. */}
      <rect
        x={regulator.x - 9}
        y={regulator.y + regulator.height * 0.22}
        width={9}
        height={regulator.height * 0.56}
        fill="url(#shade-metal)"
      />
      {[0.15, 0.5, 0.85].map((t) => (
        <rect
          key={t}
          x={regulator.x + regulator.width}
          y={regulator.y + regulator.height * t - 3.2}
          width={8}
          height={6.4}
          fill="#c2cacd"
        />
      ))}
      <rect {...regulator} rx={1.5} fill="#17191b" />
      <rect {...regulator} rx={1.5} fill="url(#shade-side)" />

      {/* The USB-to-serial chip, with a row of legs on each side, and a few small parts. */}
      {Array.from({ length: 6 }, (_, i) => usbBridge.y + 5 + i * ((usbBridge.height - 10) / 5)).map(
        (y) => (
          <rect
            key={y}
            x={usbBridge.x - 4}
            y={y - 1.6}
            width={usbBridge.width + 8}
            height={3.2}
            fill="#c2cacd"
          />
        ),
      )}
      <rect {...usbBridge} rx={2} fill="#17191b" />
      <rect {...usbBridge} rx={2} fill="url(#shade-side)" />
      <circle cx={usbBridge.x + 6} cy={usbBridge.y + 6} r={2} fill="#0b0d0e" />
      {[
        { x: regulator.x + mm(1), y: regulator.y - mm(2.4), body: '#b98d5a' },
        { x: regulator.x + mm(1), y: regulator.y + regulator.height + mm(1.1), body: '#b98d5a' },
        { x: usbBridge.x + mm(0.4), y: usbBridge.y - mm(2.6), body: '#2b2f31' },
        { x: usbBridge.x + mm(0.4), y: usbBridge.y + usbBridge.height + mm(1.3), body: '#2b2f31' },
      ].map(({ x, y, body }) => (
        <g key={`${x},${y}`}>
          <rect x={x} y={y} width={mm(2.2)} height={mm(1.2)} fill="#c9ced0" />
          <rect x={x + mm(0.5)} y={y} width={mm(1.2)} height={mm(1.2)} fill={body} />
        </g>
      ))}

      {/* Power light, and the LED on GPIO2. */}
      <Light
        x={layout.powerLed.x}
        y={layout.powerLed.y}
        label="PWR"
        off="#5a2622"
        on="#ff5c4d"
        level={props.powered ? 1 : 0}
      />
      <Light
        x={layout.pinLed.x}
        y={layout.pinLed.y}
        label="D2"
        off="#22365a"
        on="#5aa2ff"
        level={Math.max(0, Math.min(1, props.ledLevel))}
      />

      {/* The module: its own small board, solder pads on three sides, the shield and the antenna. */}
      <rect {...module} transform="translate(1.5 3)" fill="#000" opacity={0.25} />
      {edgePads.flatMap((x) =>
        [module.y - 3.5, module.y + module.height - 4.5].map((y) => (
          <rect key={`${x},${y}`} x={x - 3.2} y={y} width={6.4} height={8} rx={1} fill={GOLD} />
        )),
      )}
      {endPads.map((y) => (
        <rect key={y} x={module.x - 3.5} y={y - 3.2} width={8} height={6.4} rx={1} fill={GOLD} />
      ))}
      <rect {...module} rx={2} fill="#10161a" />
      <rect {...module} rx={2} fill="url(#shade-board)" />
      <rect {...module} rx={2} fill="none" stroke="#05080a" />
      <path
        d={meander}
        fill="none"
        stroke={GOLD}
        strokeWidth={5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <rect {...shield} transform="translate(1 2)" rx={3} fill="#000" opacity={0.3} />
      <rect {...shield} rx={3} fill="url(#shade-metal)" stroke={METAL_EDGE} />
      <rect
        x={shield.x + 5}
        y={shield.y + 5}
        width={shield.width - 10}
        height={shield.height - 10}
        rx={2}
        fill="none"
        stroke="#fff"
        strokeOpacity={0.35}
      />
      <text
        x={shield.x + shield.width / 2}
        y={shield.y + shield.height / 2 - 4}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fill="#4b5458"
      >
        ESP-WROOM-32
      </text>
      <text
        x={shield.x + shield.width / 2}
        y={shield.y + shield.height / 2 + 14}
        textAnchor="middle"
        fontSize={9}
        fill="#5d676b"
      >
        Wi-Fi · Bluetooth
      </text>
    </g>
  );
}

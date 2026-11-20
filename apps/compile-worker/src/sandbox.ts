import { execFile } from 'node:child_process';
import type { SandboxMode } from './config';

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const MAX_OUTPUT_BYTES = 256 * 1024;

/**
 * Builds the bubblewrap command line for one job. Inside the sandbox the
 * process sees only a read-only /usr (the toolchain), an empty /tmp and the
 * job directory mounted at /work. There is no network, no /etc, no /home and
 * no environment, so `#include "/etc/passwd"` or `.incbin` have nothing to read.
 */
function bwrapArgs(jobDir: string, tool: string, args: string[]): string[] {
  return [
    '--unshare-all',
    '--die-with-parent',
    '--new-session',
    '--clearenv',
    '--setenv',
    'PATH',
    '/usr/bin',
    '--ro-bind',
    '/usr',
    '/usr',
    '--symlink',
    'usr/bin',
    '/bin',
    '--symlink',
    'usr/lib',
    '/lib',
    '--symlink',
    'usr/lib64',
    '/lib64',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/tmp',
    '--bind',
    jobDir,
    '/work',
    '--chdir',
    '/work',
    tool,
    ...args,
  ];
}

/**
 * Runs one toolchain command against the files in `jobDir`. Never goes through
 * a shell, so nothing in the student's source can become a command.
 */
export function runTool(
  mode: SandboxMode,
  jobDir: string,
  tool: string,
  args: string[],
  timeoutMs: number,
): Promise<RunResult> {
  const [command, commandArgs] =
    mode === 'bwrap' ? ['bwrap', bwrapArgs(jobDir, tool, args)] : [tool, args];

  return new Promise((resolve, reject) => {
    execFile(
      command,
      commandArgs,
      {
        cwd: jobDir,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
        env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
      },
      (error, stdout, stderr) => {
        if (error && typeof error.code === 'string' && error.code === 'ENOENT') {
          reject(new Error(`Cannot run "${command}": not installed`));
          return;
        }
        resolve({
          exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          stdout,
          stderr,
          timedOut: Boolean(error?.killed),
        });
      },
    );
  });
}

/** Fails fast at start-up when the configured isolation cannot actually be provided. */
export async function assertSandboxWorks(mode: SandboxMode, probeDir: string): Promise<void> {
  if (mode !== 'bwrap') return;
  const probe = await runTool('bwrap', probeDir, 'avr-gcc', ['--version'], 5_000);
  if (probe.exitCode !== 0) {
    throw new Error(
      `COMPILE_SANDBOX=bwrap but bubblewrap could not start avr-gcc: ${probe.stderr.trim()}\n` +
        'Install bubblewrap and avr-gcc, or run the worker in its container with COMPILE_SANDBOX=container.',
    );
  }
}

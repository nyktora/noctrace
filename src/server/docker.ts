/**
 * Docker support for noctrace.
 *
 * Orchestrates container inspection, HTTP-tool detection, host URL resolution,
 * watcher injection, and cleanup.  All Docker commands go through the
 * DockerRunner interface so callers (and tests) can swap in a stub.
 */

import path from 'node:path';
import os from 'node:os';
import type { SpawnOptions } from 'node:child_process';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ExecOptions {
  stdio?: 'pipe' | 'inherit' | 'ignore';
  timeout?: number;
}

export interface ChildProcessLike {
  kill(): void;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

export interface DockerRunner {
  /** Run a command synchronously. Returns stdout as a string. Throws on nonzero exit. */
  execSync(cmd: string, args: string[], opts?: ExecOptions): string;
  /** Spawn a command asynchronously. */
  spawn(cmd: string, args: string[], opts?: SpawnOptions): ChildProcessLike;
}

// ---------------------------------------------------------------------------
// Default runner (real child_process)
// ---------------------------------------------------------------------------

import { execFileSync, spawn as nodeSpawn } from 'node:child_process';

export const defaultDockerRunner: DockerRunner = {
  execSync(cmd, args, opts = {}) {
    return execFileSync(cmd, args, { stdio: opts.stdio ?? 'pipe', timeout: opts.timeout })
      .toString();
  },
  spawn(cmd, args, opts = {}) {
    return nodeSpawn(cmd, args, opts) as unknown as ChildProcessLike;
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CONTAINER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/**
 * Returns true when the container name is syntactically safe to pass as an
 * argv element.  Rejects names that could be used for command injection or
 * path traversal.
 */
export function isValidContainerName(name: string): boolean {
  return CONTAINER_NAME_RE.test(name);
}

/**
 * Returns true when a path is free of directory-traversal sequences.
 * Any segment equal to `..` is rejected regardless of surrounding context.
 */
export function isValidContainerPath(p: string): boolean {
  return !p.split('/').includes('..');
}

// ---------------------------------------------------------------------------
// Container state
// ---------------------------------------------------------------------------

/**
 * Verify the container is running.  Throws with a user-friendly message when
 * the container is not found or not running.
 */
export function assertContainerRunning(containerArg: string, runner: DockerRunner): void {
  try {
    runner.execSync(
      'docker',
      ['inspect', '--format', '{{.State.Running}}', containerArg],
      { stdio: 'pipe' },
    );
  } catch {
    throw new Error(
      `Container "${containerArg}" not found or not running.\nCheck: docker ps`,
    );
  }
}

// ---------------------------------------------------------------------------
// Claude config dir inside container
// ---------------------------------------------------------------------------

/**
 * Ask the container for the Claude config directory (respects CLAUDE_CONFIG_DIR).
 */
export function resolveClaudeDir(containerArg: string, runner: DockerRunner): string {
  return runner
    .execSync(
      'docker',
      ['exec', containerArg, 'sh', '-c', 'echo ${CLAUDE_CONFIG_DIR:-$HOME/.claude}'],
      { stdio: 'pipe' },
    )
    .trim();
}

// ---------------------------------------------------------------------------
// HTTP tool detection
// ---------------------------------------------------------------------------

export type HttpTool = 'curl' | 'wget' | 'none';

/**
 * Determine which HTTP client is available inside the container.
 * Tries curl first, falls back to wget, returns 'none' if neither is present.
 */
export function detectHttpTool(containerArg: string, runner: DockerRunner): HttpTool {
  try {
    runner.execSync('docker', ['exec', containerArg, 'which', 'curl'], { stdio: 'pipe' });
    return 'curl';
  } catch { /* curl not found */ }

  try {
    runner.execSync('docker', ['exec', containerArg, 'which', 'wget'], { stdio: 'pipe' });
    return 'wget';
  } catch { /* wget not found */ }

  return 'none';
}

// ---------------------------------------------------------------------------
// Host URL resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the URL the container can use to reach the host.
 *
 * Priority:
 * 1. `host.docker.internal` (works on macOS/Windows Docker Desktop)
 * 2. Gateway IP from `docker inspect` (Linux Docker)
 * 3. Fallback to `host.docker.internal` (best-effort)
 */
export function resolveHostUrl(containerArg: string, runner: DockerRunner): string {
  try {
    runner.execSync(
      'docker',
      ['exec', containerArg, 'getent', 'hosts', 'host.docker.internal'],
      { stdio: 'pipe' },
    );
    return 'http://host.docker.internal';
  } catch { /* not available — try gateway IP */ }

  try {
    const gatewayIp = runner
      .execSync(
        'docker',
        [
          'inspect',
          '--format',
          '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}',
          containerArg,
        ],
        { stdio: 'pipe' },
      )
      .trim();

    if (gatewayIp) {
      return `http://${gatewayIp}`;
    }
  } catch { /* ignore */ }

  return 'http://host.docker.internal';
}

// ---------------------------------------------------------------------------
// Watcher injection
// ---------------------------------------------------------------------------

/**
 * Copy a local script file into the container at `/tmp/noctrace-watcher.sh`,
 * mark it executable, and return.  The caller is responsible for running it.
 */
export function copyWatcherScript(
  containerArg: string,
  localScriptPath: string,
  runner: DockerRunner,
): void {
  runner.execSync(
    'docker',
    ['cp', localScriptPath, `${containerArg}:/tmp/noctrace-watcher.sh`],
    { stdio: 'pipe' },
  );
  runner.execSync(
    'docker',
    ['exec', containerArg, 'chmod', '+x', '/tmp/noctrace-watcher.sh'],
    { stdio: 'pipe' },
  );
}

/**
 * Start the injected watcher script inside the container in the background.
 * Returns the spawned process handle (callers can swallow its errors).
 */
export function spawnWatcher(
  containerArg: string,
  claudeDir: string,
  containerTargetUrl: string,
  runner: DockerRunner,
): ChildProcessLike {
  const proc = runner.spawn(
    'docker',
    [
      'exec', '-d', containerArg,
      'sh', '-c', '/tmp/noctrace-watcher.sh "$1" "$2" "$3"', '--',
      claudeDir, containerTargetUrl, containerArg,
    ],
    { stdio: 'ignore' },
  );
  proc.on('error', () => { /* swallow */ });
  return proc;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Kill the noctrace-watcher process inside the container.
 * Safe to call after container exit — errors are swallowed.
 */
export function cleanupWatcher(containerArg: string, runner: DockerRunner): void {
  try {
    runner.execSync(
      'docker',
      ['exec', containerArg, 'sh', '-c', 'pkill -f noctrace-watcher 2>/dev/null || true'],
      { stdio: 'pipe', timeout: 3000 },
    );
  } catch { /* container may be gone */ }
}

// ---------------------------------------------------------------------------
// Devcontainer support
// ---------------------------------------------------------------------------

/**
 * Look up a running container by an exact Docker label match.
 * Returns the container ID (short form), or null when nothing matches.
 *
 * Uses `docker ps --filter "label=<label>=<value>" --format "{{.ID}}"`.
 * The label and value are passed as a single `label=key=value` filter argument
 * so no shell interpolation occurs.
 */
export function findContainerByLabel(
  label: string,
  value: string,
  runner: DockerRunner,
): string | null {
  let output: string;
  try {
    output = runner.execSync(
      'docker',
      ['ps', '--filter', `label=${label}=${value}`, '--format', '{{.ID}}'],
      { stdio: 'pipe' },
    );
  } catch {
    return null;
  }
  const id = output.trim().split('\n')[0]?.trim() ?? '';
  return id.length > 0 ? id : null;
}

/**
 * Resolve a devcontainer argument to a concrete container ID.
 *
 * If `input` looks like a path (starts with `/`, `.`, `./`, or `~/`) it is
 * resolved to an absolute path and looked up via the canonical
 * `devcontainer.local_folder` label, falling back to the older
 * `vsch.local.folder` label.  When neither label matches an error is thrown
 * with a clear hint pointing the user at `docker ps --filter "label=devcontainer.*"`.
 *
 * If `input` is not a path it is treated as a container name/ID.
 * `isValidContainerName` is checked and the value is returned directly.
 *
 * @param cwd - Working directory used to resolve relative paths. Defaults to `process.cwd()`.
 */
export function resolveDevcontainerContainer(
  input: string,
  runner: DockerRunner,
  cwd?: string,
): string {
  const isPath = input.startsWith('/') || input.startsWith('.') || input.startsWith('~/');

  if (!isPath) {
    if (!isValidContainerName(input)) {
      throw new Error(`Invalid container name: "${input}"`);
    }
    return input;
  }

  // Resolve to an absolute path — devcontainer labels always store absolute paths.
  // path.resolve does not expand ~ so handle that explicitly.
  let absPath: string;
  if (input.startsWith('~/')) {
    absPath = path.join(os.homedir(), input.slice(2));
  } else {
    absPath = path.resolve(cwd ?? process.cwd(), input);
  }

  // Try canonical label first, then the older VS Code label.
  const id =
    findContainerByLabel('devcontainer.local_folder', absPath, runner) ??
    findContainerByLabel('vsch.local.folder', absPath, runner);

  if (id === null) {
    throw new Error(
      `No devcontainer found for path: ${absPath}\n` +
      `Hint: make sure the devcontainer is running, then check:\n` +
      `  docker ps --filter "label=devcontainer.local_folder"`,
    );
  }

  return id;
}

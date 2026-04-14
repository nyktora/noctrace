/**
 * Unit tests for src/server/docker.ts
 *
 * Every test uses a stub DockerRunner injected via the function parameter —
 * no module mocking, no real docker calls.
 *
 * Security-sensitive branches tested:
 *  1. Path traversal rejection (ISSUE-001)
 *  2. Container-not-running error surfaces "docker ps"
 *  3. curl vs wget fallback (and "none" when both missing)
 *  4. host.docker.internal vs gateway IP fallback
 *  5. Argument shape for docker exec/cp (no shell-string concatenation)
 *  6. Cleanup calls the right argv
 */

import { describe, it, expect, vi } from 'vitest';
import type { DockerRunner, ChildProcessLike, ExecOptions } from '../../src/server/docker';
import {
  isValidContainerName,
  isValidContainerPath,
  assertContainerRunning,
  resolveClaudeDir,
  detectHttpTool,
  resolveHostUrl,
  copyWatcherScript,
  spawnWatcher,
  cleanupWatcher,
} from '../../src/server/docker';
import type { SpawnOptions } from 'node:child_process';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a DockerRunner stub where execSync always succeeds with the given output. */
function makeRunner(overrides?: {
  execSync?: (cmd: string, args: string[], opts?: ExecOptions) => string;
  spawn?: (cmd: string, args: string[], opts?: SpawnOptions) => ChildProcessLike;
}): DockerRunner & { calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];

  const fakeProc: ChildProcessLike = {
    kill: vi.fn(),
    on: vi.fn().mockReturnThis(),
  };

  return {
    calls,
    execSync(cmd, args, opts) {
      calls.push({ cmd, args });
      if (overrides?.execSync) return overrides.execSync(cmd, args, opts);
      return '';
    },
    spawn(cmd, args, opts) {
      calls.push({ cmd, args });
      if (overrides?.spawn) return overrides.spawn(cmd, args, opts);
      return fakeProc;
    },
  };
}

/** Build a runner that throws on the n-th execSync call. */
function makeRunnerThrowingOn(throwOnCallIndexes: Set<number>, output = ''): ReturnType<typeof makeRunner> {
  let callIndex = 0;
  return makeRunner({
    execSync(_cmd, _args) {
      const idx = callIndex++;
      if (throwOnCallIndexes.has(idx)) throw new Error('command failed');
      return output;
    },
  });
}

// ---------------------------------------------------------------------------
// 1. Path traversal rejection
// ---------------------------------------------------------------------------

describe('isValidContainerPath', () => {
  it('rejects a path containing ".." segment', () => {
    expect(isValidContainerPath('/home/user/../etc/passwd')).toBe(false);
    expect(isValidContainerPath('../secret')).toBe(false);
    expect(isValidContainerPath('foo/../bar')).toBe(false);
  });

  it('accepts normal absolute paths', () => {
    expect(isValidContainerPath('/home/user/.claude')).toBe(true);
    expect(isValidContainerPath('/tmp/noctrace-watcher.sh')).toBe(true);
  });

  it('accepts paths that contain ".." as a substring but not a full segment', () => {
    // "..foo" is not the same as ".." — this is a valid path segment
    expect(isValidContainerPath('/home/..config')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 1b. Container name validation
// ---------------------------------------------------------------------------

describe('isValidContainerName', () => {
  it('rejects names starting with special characters', () => {
    expect(isValidContainerName('../bad')).toBe(false);
    expect(isValidContainerName(';rm -rf /')).toBe(false);
    expect(isValidContainerName('$(evil)')).toBe(false);
    expect(isValidContainerName('')).toBe(false);
  });

  it('rejects names with spaces or shell metacharacters mid-string', () => {
    expect(isValidContainerName('my container')).toBe(false);
    expect(isValidContainerName('my|container')).toBe(false);
  });

  it('accepts valid container names', () => {
    expect(isValidContainerName('my-container')).toBe(true);
    expect(isValidContainerName('container_1')).toBe(true);
    expect(isValidContainerName('abc123')).toBe(true);
    expect(isValidContainerName('a')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Container-not-running — error message must mention "docker ps"
// ---------------------------------------------------------------------------

describe('assertContainerRunning', () => {
  it('throws with a message mentioning "docker ps" when inspect fails', () => {
    const runner = makeRunner({
      execSync() { throw new Error('No such container'); },
    });

    expect(() => assertContainerRunning('missing-box', runner)).toThrow(/docker ps/);
  });

  it('does not throw when inspect succeeds', () => {
    const runner = makeRunner(); // always succeeds
    expect(() => assertContainerRunning('my-box', runner)).not.toThrow();
  });

  it('passes container name as separate argv element, not concatenated', () => {
    const runner = makeRunner();
    assertContainerRunning('my-box', runner);

    const inspectCall = runner.calls.find((c) => c.args.includes('inspect'));
    expect(inspectCall).toBeDefined();
    // Container name must be its own array element
    expect(inspectCall!.args).toContain('my-box');
    // Should NOT be part of a shell-interpolated string like "inspect my-box"
    const concatenated = inspectCall!.args.some((a) => a.includes(' my-box') || a.includes('my-box '));
    expect(concatenated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. curl vs wget fallback
// ---------------------------------------------------------------------------

describe('detectHttpTool', () => {
  it('returns "curl" when which curl succeeds', () => {
    const runner = makeRunner(); // all calls succeed
    const result = detectHttpTool('my-box', runner);
    expect(result).toBe('curl');
  });

  it('returns "wget" when curl is missing but wget is present', () => {
    // First execSync (which curl) throws; second (which wget) succeeds
    const runner = makeRunnerThrowingOn(new Set([0]));
    const result = detectHttpTool('my-box', runner);
    expect(result).toBe('wget');
  });

  it('returns "none" when both curl and wget are missing', () => {
    // Both calls throw
    const runner = makeRunnerThrowingOn(new Set([0, 1]));
    const result = detectHttpTool('my-box', runner);
    expect(result).toBe('none');
  });

  it('passes "which" as separate argv, not a shell string', () => {
    const runner = makeRunner();
    detectHttpTool('my-box', runner);

    const whichCall = runner.calls.find((c) => c.args.includes('which'));
    expect(whichCall).toBeDefined();
    // 'curl' or 'wget' must be its own element
    const toolArg = whichCall!.args.find((a) => a === 'curl' || a === 'wget');
    expect(toolArg).toBeDefined();
    // Must not be 'which curl' (shell concatenation)
    expect(whichCall!.args).not.toContain('which curl');
    expect(whichCall!.args).not.toContain('which wget');
  });
});

// ---------------------------------------------------------------------------
// 4. host.docker.internal vs gateway IP fallback
// ---------------------------------------------------------------------------

describe('resolveHostUrl', () => {
  it('returns host.docker.internal when getent succeeds', () => {
    const runner = makeRunner(); // getent call succeeds
    const url = resolveHostUrl('my-box', runner);
    expect(url).toBe('http://host.docker.internal');
  });

  it('falls back to gateway IP when getent fails but docker inspect returns an IP', () => {
    // call 0 = getent (throw), call 1 = docker inspect --format (returns IP)
    const runner = makeRunnerThrowingOn(new Set([0]), '172.17.0.1\n');
    const url = resolveHostUrl('my-box', runner);
    expect(url).toBe('http://172.17.0.1');
  });

  it('falls back to host.docker.internal when both getent and inspect fail', () => {
    const runner = makeRunnerThrowingOn(new Set([0, 1]));
    const url = resolveHostUrl('my-box', runner);
    expect(url).toBe('http://host.docker.internal');
  });

  it('falls back to host.docker.internal when inspect returns empty string', () => {
    // getent throws; inspect succeeds but returns empty
    const runner = makeRunnerThrowingOn(new Set([0]), '');
    const url = resolveHostUrl('my-box', runner);
    expect(url).toBe('http://host.docker.internal');
  });
});

// ---------------------------------------------------------------------------
// 5. Argument shape for docker cp / exec (no shell concatenation)
// ---------------------------------------------------------------------------

describe('copyWatcherScript', () => {
  it('passes container name and target path as separate argv elements', () => {
    const runner = makeRunner();
    copyWatcherScript('my-box', '/tmp/local-script.sh', runner);

    const cpCall = runner.calls.find((c) => c.args.includes('cp'));
    expect(cpCall).toBeDefined();
    // Source path must be its own element
    expect(cpCall!.args).toContain('/tmp/local-script.sh');
    // Target must be containerName:/tmp/..., as a single element — NOT two elements
    const target = cpCall!.args.find((a) => a.startsWith('my-box:'));
    expect(target).toBeDefined();
    expect(target).toBe('my-box:/tmp/noctrace-watcher.sh');
  });

  it('calls chmod +x on the correct target path', () => {
    const runner = makeRunner();
    copyWatcherScript('my-box', '/tmp/local-script.sh', runner);

    const chmodCall = runner.calls.find((c) => c.args.includes('chmod'));
    expect(chmodCall).toBeDefined();
    expect(chmodCall!.args).toContain('+x');
    expect(chmodCall!.args).toContain('/tmp/noctrace-watcher.sh');
  });
});

describe('spawnWatcher', () => {
  it('uses "exec -d" with container name as its own argv element', () => {
    const runner = makeRunner();
    spawnWatcher('my-box', '/root/.claude', 'http://host.docker.internal:4117', runner);

    const spawnCall = runner.calls.find((c) => c.cmd === 'docker');
    expect(spawnCall).toBeDefined();
    expect(spawnCall!.args).toContain('exec');
    expect(spawnCall!.args).toContain('-d');
    expect(spawnCall!.args).toContain('my-box');
    // Container name must not be concatenated with flags
    expect(spawnCall!.args).not.toContain('exec my-box');
  });

  it('passes claudeDir, containerTargetUrl, and containerArg as positional args after "--" — not interpolated into the -c string', () => {
    const claudeDir = '/root/.claude';
    const targetUrl = 'http://host.docker.internal:4117';
    const container = 'my-box';
    const runner = makeRunner();
    spawnWatcher(container, claudeDir, targetUrl, runner);

    const spawnCall = runner.calls.find((c) => c.cmd === 'docker');
    expect(spawnCall).toBeDefined();
    const { args } = spawnCall!;

    // The -c script body must use positional references only, never interpolated values
    const shCScript = args.find((a) => a.startsWith('/tmp/noctrace-watcher.sh'));
    expect(shCScript).toBeDefined();
    expect(shCScript).toBe('/tmp/noctrace-watcher.sh "$1" "$2" "$3"');
    expect(shCScript).not.toContain(claudeDir);
    expect(shCScript).not.toContain(targetUrl);

    // "--" separator must be present before the positional args
    const separatorIdx = args.indexOf('--');
    expect(separatorIdx).toBeGreaterThan(-1);

    // The three values must appear as distinct elements after "--"
    expect(args[separatorIdx + 1]).toBe(claudeDir);
    expect(args[separatorIdx + 2]).toBe(targetUrl);
    expect(args[separatorIdx + 3]).toBe(container);
  });
});

// ---------------------------------------------------------------------------
// 6. Cleanup — calls pkill inside the right container
// ---------------------------------------------------------------------------

describe('cleanupWatcher', () => {
  it('calls docker exec with the correct container name', () => {
    const runner = makeRunner();
    cleanupWatcher('my-box', runner);

    const execCall = runner.calls.find((c) => c.args.includes('exec'));
    expect(execCall).toBeDefined();
    expect(execCall!.cmd).toBe('docker');
    expect(execCall!.args).toContain('my-box');
  });

  it('passes a pkill command to kill the watcher process', () => {
    const runner = makeRunner();
    cleanupWatcher('my-box', runner);

    const execCall = runner.calls.find((c) => c.args.includes('exec'));
    const shellArg = execCall!.args.find((a) => a.includes('pkill'));
    expect(shellArg).toBeDefined();
    expect(shellArg).toMatch(/pkill.*noctrace-watcher/);
  });

  it('does not throw even when docker exec fails (container may be gone)', () => {
    const runner = makeRunner({
      execSync() { throw new Error('container exited'); },
    });
    expect(() => cleanupWatcher('my-box', runner)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveClaudeDir — smoke test for argument shape
// ---------------------------------------------------------------------------

describe('resolveClaudeDir', () => {
  it('returns trimmed output and uses exec with separate container name arg', () => {
    const runner = makeRunner({
      execSync() { return '  /root/.claude\n'; },
    });
    const dir = resolveClaudeDir('my-box', runner);
    expect(dir).toBe('/root/.claude');

    const execCall = runner.calls.find((c) => c.args.includes('exec'));
    expect(execCall).toBeDefined();
    expect(execCall!.args).toContain('my-box');
  });
});

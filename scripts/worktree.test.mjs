import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "worktree.mjs");

let scratch;
let repo;
let bin;
let rexLog;
let pnpmLog;

function git(...args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(path, content) {
  const file = join(repo, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function fakeBin(name, body) {
  const file = join(bin, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

function run(args, env = {}, cwd = repo) {
  return spawnSync("node", [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      REX_SESSION: "",
      ...env,
    },
  });
}

function logged(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "worktree-test-")));
  repo = join(scratch, "numa");
  bin = join(scratch, "bin");
  rexLog = join(scratch, "rex.log");
  pnpmLog = join(scratch, "pnpm.log");
  mkdirSync(repo);
  mkdirSync(bin);

  git("init", "-q", "-b", "master");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  write(".gitignore", ".env\n.atl/\n.claude/\nnode_modules/\n*.log\n");
  write("tracked.txt", "tracked\n");
  git("add", ".");
  git("commit", "-q", "-m", "init");

  write(".env", "SECRET=1\n");
  write(".atl/skill-registry.md", `path: ${repo}/.agents/skills/x\n`);
  write("node_modules/dep/index.js", "skipped\n");
  write("debug.log", "skipped\n");
  mkdirSync(join(repo, ".claude"));
  symlinkSync("../.agents/skills/x", join(repo, ".claude/x"));

  fakeBin(
    "rex",
    `echo "$@" >> "${rexLog}"\n` +
      `if [ "$2" = ls ]; then\n` +
      `  if [ -n "$FAKE_REX_LS" ]; then echo "$FAKE_REX_LS"; else echo '{"windows":[]}'; fi\n` +
      `fi`,
  );
  fakeBin("pnpm", `echo "$PWD $@" >> "${pnpmLog}"\nexit \${FAKE_PNPM_EXIT:-0}`);
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

test("creates the worktree on a new branch from master beside the checkout", () => {
  git("checkout", "-q", "-b", "elsewhere");
  write("elsewhere.txt", "not on master\n");
  git("add", ".");
  git("commit", "-q", "-m", "elsewhere");

  const result = run(["feat-x"]);

  assert.equal(result.status, 0, result.stderr);
  const target = join(scratch, "numa-worktrees/feat-x");
  assert.equal(readFileSync(join(target, "tracked.txt"), "utf8"), "tracked\n");
  assert.equal(existsSync(join(target, "elsewhere.txt")), false);
  assert.match(git("worktree", "list"), /numa-worktrees\/feat-x .*\[feat-x\]/);
  assert.match(result.stdout, new RegExp(`${target}\\n?$`));
});

test("--base picks the starting point", () => {
  git("checkout", "-q", "-b", "elsewhere");
  write("elsewhere.txt", "kept\n");
  git("add", ".");
  git("commit", "-q", "-m", "elsewhere");

  const result = run(["feat-x", "--base", "elsewhere"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(scratch, "numa-worktrees/feat-x/elsewhere.txt")), true);
});

test("checks out a branch that already exists", () => {
  git("branch", "existing");

  const result = run(["existing"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(git("worktree", "list"), /\[existing\]/);
});

test("restores ignored assets, keeps symlinks and skips build output", () => {
  assert.equal(run(["feat-x"]).status, 0);

  const target = join(scratch, "numa-worktrees/feat-x");
  assert.equal(readFileSync(join(target, ".env"), "utf8"), "SECRET=1\n");
  assert.equal(lstatSync(join(target, ".claude/x")).isSymbolicLink(), true);
  assert.equal(existsSync(join(target, "node_modules")), false);
  assert.equal(existsSync(join(target, "debug.log")), false);
});

test("repoints the skill registry at the new worktree", () => {
  assert.equal(run(["feat-x"]).status, 0);

  const target = join(scratch, "numa-worktrees/feat-x");
  assert.equal(
    readFileSync(join(target, ".atl/skill-registry.md"), "utf8"),
    `path: ${target}/.agents/skills/x\n`,
  );
});

test("hydrates from the primary checkout when run inside another worktree", () => {
  assert.equal(run(["first"]).status, 0);
  const first = join(scratch, "numa-worktrees/first");

  const result = run(["second"], {}, first);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(scratch, "numa-worktrees/second/.env")), true);
});

test("running again reconciles the existing worktree instead of failing", () => {
  assert.equal(run(["feat-x"]).status, 0);
  const target = join(scratch, "numa-worktrees/feat-x");
  rmSync(join(target, ".env"));
  writeFileSync(join(target, ".atl/skill-registry.md"), "edited\n");

  const result = run(["feat-x"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(target, ".env")), true);
  assert.equal(readFileSync(join(target, ".atl/skill-registry.md"), "utf8"), "edited\n");
});

test("installs dependencies with the frozen pnpm lockfile", () => {
  write("package.json", "{}\n");
  write("pnpm-lock.yaml", "lockfileVersion: 9\n");
  git("add", ".");
  git("commit", "-q", "-m", "deps");

  const result = run(["feat-x"]);

  assert.equal(result.status, 0, result.stderr);
  const target = join(scratch, "numa-worktrees/feat-x");
  assert.equal(logged(pnpmLog), `${target} install --frozen-lockfile --prefer-offline\n`);
});

test("a failed install exits non-zero and opens no tab", () => {
  write("package.json", "{}\n");
  write("pnpm-lock.yaml", "lockfileVersion: 9\n");
  git("add", ".");
  git("commit", "-q", "-m", "deps");

  const result = run(["feat-x"], { FAKE_PNPM_EXIT: "1", REX_SESSION: "session:1" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /install failed/);
  assert.doesNotMatch(logged(rexLog), /new/);
});

test("HYDRATE_INSTALL=0 skips the install", () => {
  write("package.json", "{}\n");
  write("pnpm-lock.yaml", "lockfileVersion: 9\n");
  git("add", ".");
  git("commit", "-q", "-m", "deps");

  const result = run(["feat-x"], { HYDRATE_INSTALL: "0" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(logged(pnpmLog), "");
});

test("opens a background tab in the current Rex session, not a new session", () => {
  const result = run(["feat/x"], { REX_SESSION: "session:1" });

  assert.equal(result.status, 0, result.stderr);
  const target = join(scratch, "numa-worktrees/feat-x");
  assert.match(
    logged(rexLog),
    new RegExp(`^window new -s session:1 feat-x -c ${target} --focus=false$`, "m"),
  );
  assert.doesNotMatch(logged(rexLog), /^new /m);
});

test("does not duplicate a Rex tab that already exists", () => {
  const result = run(["feat-x"], {
    REX_SESSION: "session:1",
    FAKE_REX_LS: '{"windows":[{"window_id":"window:2","label":"feat-x"}]}',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(logged(rexLog), /window new/);
});

test("unreadable Rex output only warns: the worktree is still ready", () => {
  const result = run(["feat-x"], { REX_SESSION: "session:1", FAKE_REX_LS: "not json" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /could not list Rex tabs/);
  assert.equal(existsSync(join(scratch, "numa-worktrees/feat-x/.env")), true);
});

test("outside Rex it never calls rex", () => {
  assert.equal(run(["feat-x"]).status, 0);
  assert.equal(logged(rexLog), "");
});

test("a usage error creates nothing", () => {
  for (const args of [[], ["bad name"], ["feat-x", "--base"]]) {
    const result = run(args);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Usage: node scripts\/worktree\.mjs/);
  }
  assert.equal(existsSync(join(scratch, "numa-worktrees")), false);
});

test("refuses a path that exists but is not a worktree", () => {
  mkdirSync(join(scratch, "numa-worktrees/feat-x"), { recursive: true });

  const result = run(["feat-x"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a worktree/);
});

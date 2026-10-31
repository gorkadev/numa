#!/usr/bin/env node
// Create a Git worktree that is ready to work in: restore the gitignored
// developer assets from the primary checkout, install dependencies, and open a
// tab for it in the current Rex session when running inside Rex.
//
//   node scripts/worktree.mjs <branch> [--base <ref>]
//
// The last line of stdout is the worktree path. Running it again for the same
// branch reconciles the existing worktree. HYDRATE_INSTALL=0 skips the install.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import process from "node:process";

const USAGE = "Usage: node scripts/worktree.mjs <branch> [--base <ref>]";
const DEFAULT_BASE = "master";
const INSTALL_TIMEOUT_MS = 900000;
const MAX_BUFFER = 64 * 1024 * 1024;

// Directory names that are always ignored: build output, caches, tool state.
const SKIP_SEGMENTS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".trigger",
  ".codegraph",
  ".vercel",
  "dist",
  "build",
  "coverage",
  ".pnpm-store",
  "out",
]);

class UsageError extends Error {}

function isSkippedFileName(name) {
  return name === ".DS_Store" || name.endsWith(".log") || name === "next-env.d.ts";
}

function isSkippedPath(relativePath) {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.some((segment) => SKIP_SEGMENTS.has(segment))) return true;
  return isSkippedFileName(basename(relativePath));
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER });
  if (result.error) throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  return result;
}

function gitOutput(args, cwd) {
  const result = git(args, cwd);
  if (result.status !== 0) {
    const detail = (result.stderr || "").trim().split("\n")[0];
    throw new Error(`git ${args[0]} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout;
}

function parseArgs(argv) {
  let branch;
  let base = DEFAULT_BASE;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--base") {
      base = argv[i + 1];
      i += 1;
      if (!base) throw new UsageError("--base needs a ref");
    } else if (argv[i].startsWith("-") || branch) {
      throw new UsageError(`unexpected argument: ${argv[i]}`);
    } else {
      branch = argv[i];
    }
  }

  if (!branch) throw new UsageError("missing branch name");
  if (git(["check-ref-format", "--branch", branch]).status !== 0) {
    throw new UsageError(`invalid branch name: ${branch}`);
  }
  return { branch, base };
}

function listWorktrees() {
  return gitOutput(["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

function ensureWorktree(target, branch, base, worktrees) {
  if (worktrees.includes(target)) return;
  if (existsSync(target)) throw new Error(`${target} exists but is not a worktree`);

  mkdirSync(dirname(target), { recursive: true });
  const branchExists =
    git(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0;
  const args = branchExists
    ? ["worktree", "add", "--quiet", target, branch]
    : ["worktree", "add", "--quiet", "-b", branch, target, base];
  gitOutput(args);
}

// Ignored entries are the inventory. Git reports both files and directories,
// with a trailing slash on directories.
function listIgnoredEntries(sourceRoot) {
  const output = gitOutput(
    ["-C", sourceRoot, "status", "--ignored=matching", "--porcelain", "-uall"],
  );
  return output
    .split("\n")
    .filter((line) => line.startsWith("!! "))
    .map((line) => line.slice(3).replace(/\/+$/, ""))
    .filter(Boolean);
}

function copyEntry(relativePath, context, stats) {
  const sourcePath = join(context.sourceRoot, relativePath);
  const targetPath = join(context.targetRoot, relativePath);

  let sourceStat;
  try {
    sourceStat = lstatSync(sourcePath);
  } catch {
    // Vanished between listing and copying; nothing to restore.
    return;
  }

  // Directories are always reconciled, never skipped as a whole: a partially
  // hydrated worktree must still receive files added later in the source.
  if (sourceStat.isDirectory()) {
    mkdirSync(targetPath, { recursive: true });
    for (const name of readdirSync(sourcePath)) {
      const childRelative = `${relativePath}/${name}`;
      if (!isSkippedPath(childRelative)) copyEntry(childRelative, context, stats);
    }
    return;
  }

  if (existsOrDangling(targetPath)) {
    stats.existing += 1;
    return;
  }

  if (sourceStat.isSymbolicLink()) {
    mkdirSync(dirname(targetPath), { recursive: true });
    symlinkSync(readlinkSync(sourcePath), targetPath);
    stats.copied += 1;
  } else if (sourceStat.isFile()) {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
    chmodSync(targetPath, sourceStat.mode & 0o777);
    stats.copied += 1;
    if (relativePath.startsWith(".atl/")) repointAtlasFile(targetPath, context);
  }
}

function existsOrDangling(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

// The generated skill registry embeds absolute paths pointing at the source
// checkout, so those pointers must follow the copy into the new worktree.
function repointAtlasFile(file, { sourceRoot, targetRoot }) {
  if (!file.endsWith(".md") && !file.endsWith(".json")) return;
  const text = readFileSync(file, "utf8");
  if (text.includes(sourceRoot)) writeFileSync(file, text.split(sourceRoot).join(targetRoot));
}

function hydrate(sourceRoot, targetRoot) {
  const stats = { copied: 0, existing: 0 };
  const context = { sourceRoot, targetRoot };
  for (const entry of listIgnoredEntries(sourceRoot)) {
    if (!isSkippedPath(entry)) copyEntry(entry, context, stats);
  }
  return stats;
}

function detectInstaller(targetRoot) {
  if (existsSync(join(targetRoot, "pnpm-lock.yaml"))) {
    return { command: "pnpm", args: ["install", "--frozen-lockfile", "--prefer-offline"] };
  }
  if (existsSync(join(targetRoot, "package-lock.json"))) {
    return { command: "npm", args: ["ci"] };
  }
  if (existsSync(join(targetRoot, "yarn.lock"))) {
    return { command: "yarn", args: ["install", "--frozen-lockfile"] };
  }
  return null;
}

// Returns "ran", "skipped" or "failed". Never throws.
function installDependencies(targetRoot) {
  if (process.env.HYDRATE_INSTALL === "0") return "skipped";
  if (existsSync(join(targetRoot, "node_modules"))) return "skipped";
  if (!existsSync(join(targetRoot, "package.json"))) return "skipped";

  const installer = detectInstaller(targetRoot);
  if (!installer) return "skipped";

  const result = spawnSync(installer.command, installer.args, {
    cwd: targetRoot,
    encoding: "utf8",
    timeout: INSTALL_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  if (!result.error && result.status === 0) return "ran";

  const code = result.error?.code === "ETIMEDOUT" ? "timeout" : (result.status ?? "unknown");
  console.error(`[worktree] install failed (exit ${code})`);
  const tail = `${result.stdout ?? ""}${result.stderr ?? ""}`.split("\n").slice(-40);
  console.error(tail.join("\n").trimEnd());
  return "failed";
}

// One Rex session per project: a worktree is a tab in the session it was created
// from, opened in the background. A missing tab costs a convenience, not the
// worktree, so it only warns.
function openRexTab(branch, targetRoot) {
  const session = process.env.REX_SESSION;
  if (!session) return "not in Rex";

  const label = branch.replace(/[^A-Za-z0-9._-]+/g, "-");
  let windows;
  try {
    const list = spawnSync("rex", ["window", "ls", "-s", session, "--json"], {
      encoding: "utf8",
    });
    windows = JSON.parse(list.stdout).windows;
  } catch {
    console.error("[worktree] warning: could not list Rex tabs");
    return "failed";
  }
  if (windows.some((window) => window.label === label)) return `${label} (existing)`;

  const created = spawnSync(
    "rex",
    ["window", "new", "-s", session, label, "-c", targetRoot, "--focus=false"],
    { encoding: "utf8" },
  );
  if (created.error || created.status !== 0) {
    console.error("[worktree] warning: could not open a Rex tab");
    return "failed";
  }
  return label;
}

function main() {
  const { branch, base } = parseArgs(process.argv.slice(2));

  // The first entry is always the primary checkout, even from a linked worktree.
  const worktrees = listWorktrees();
  const source = worktrees[0];
  const directory = branch.replace(/[^A-Za-z0-9._-]+/g, "-");
  const target = join(dirname(source), `${basename(source)}-worktrees`, directory);

  ensureWorktree(target, branch, base, worktrees);

  const stats = hydrate(realpathSync(source), realpathSync(target));
  const install = installDependencies(target);
  if (install === "failed") return 1;

  const tab = openRexTab(branch, target);
  console.log(
    `[worktree] ${stats.copied} copied, ${stats.existing} present, ` +
      `install ${install}, rex ${tab}`,
  );
  console.log(target);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  const usage = error instanceof UsageError;
  console.error(`[worktree] error: ${error.message}`);
  if (usage) console.error(USAGE);
  process.exitCode = usage ? 2 : 1;
}

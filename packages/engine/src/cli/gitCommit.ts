import { execFileSync } from "node:child_process";

/** The short hash of the commit the numbers come from, marked when the working tree outside docs/ differs from it. */
export function gitCommit(): string {
  const run = (...args: string[]) => execFileSync("/usr/bin/git", args, { encoding: "utf8" }).trim();
  const hash = run("rev-parse", "--short=8", "HEAD");
  return run("status", "--porcelain", "--untracked-files=no", "--", ".", ":!docs") === "" ? hash : `${hash} plus uncommitted changes`;
}

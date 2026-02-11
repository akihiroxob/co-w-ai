import { spawn } from "child_process";
import { CommandResult } from "../types/CommandResult";

export const runShellCommand = async (command: string, cwd: string): Promise<CommandResult> => {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();

  return await new Promise<CommandResult>((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true, // keep simple for MVP
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("close", (exitCode, signal) => {
      const finishedAt = new Date();
      const finishedAtIso = finishedAt.toISOString();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const ok = exitCode === 0;

      resolve({
        ok,
        command,
        cwd,
        exitCode,
        signal: signal ? String(signal) : null,
        stdout,
        stderr,
        startedAt: startedAtIso,
        finishedAt: finishedAtIso,
        durationMs,
      });
    });
  });
};

export const execCommandCapture = async function execCommandCapture(command: string, cwd: string) {
  // uses your existing runShellCommand for exit code + stdout/stderr
  return await runShellCommand(command, cwd);
};

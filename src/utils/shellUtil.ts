import { spawn } from "child_process";
import { CommandResult } from "../types/CommandResult";
import { RepoPolicy } from "../types/RepoPolict";

export const runShellCommand = async (
  command: string,
  cwd: string,
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<CommandResult> => {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();

  return await new Promise<CommandResult>((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...(options?.env ?? {}),
      },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    const timer =
      options?.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            stderr += `\n[timeout] command exceeded ${options.timeoutMs}ms`;
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 1000);
          }, options.timeoutMs)
        : null;

    child.on("close", (exitCode, signal) => {
      if (timer) clearTimeout(timer);

      const finishedAt = new Date();
      const finishedAtIso = finishedAt.toISOString();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const ok = exitCode === 0 && !timedOut;

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
        timedOut,
      });
    });
  });
};

export const execCommandCapture = async function execCommandCapture(
  command: string,
  cwd: string,
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
) {
  return await runShellCommand(command, cwd, options);
};

export const resolveCommandFromPolicy = (policy: RepoPolicy, commandKeyOrRaw: string) => {
  const commands = policy.commands ?? {};
  const allow = new Set(policy.security?.allow ?? []);
  const forbidRaw = policy.security?.forbid_raw_command ?? true;

  if (commandKeyOrRaw in commands) {
    if (allow.size > 0 && !allow.has(commandKeyOrRaw)) {
      throw new Error(`Command key not allowed by policy: ${commandKeyOrRaw}`);
    }

    return {
      commandKey: commandKeyOrRaw,
      command: commands[commandKeyOrRaw],
    };
  }

  if (forbidRaw) {
    throw new Error(
      `Raw command is forbidden. Use a policy key (e.g. test/lint/typecheck). got=${commandKeyOrRaw}`,
    );
  }

  return {
    commandKey: null,
    command: commandKeyOrRaw,
  };
};

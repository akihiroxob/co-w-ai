import { mkdir, stat } from "node:fs/promises";

export const ensureDir = async (p: string) => {
  try {
    const s = await stat(p);
    if (!s.isDirectory()) throw new Error(`${p} is not a directory`);
  } catch {
    await mkdir(p, { recursive: true });
  }
};

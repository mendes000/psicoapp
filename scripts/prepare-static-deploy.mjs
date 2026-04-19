import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const distDir = process.env.NEXT_DIST_DIR?.trim() || "out";
const outputDir = join(process.cwd(), distDir);
const sourceDir = join(outputDir, "_next");
const targetDir = join(outputDir, "cdn", "_next");

if (!existsSync(sourceDir)) {
  process.exit(0);
}

rmSync(targetDir, { force: true, recursive: true });
mkdirSync(join(outputDir, "cdn"), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

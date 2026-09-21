/**
 * Anciennement : Premier League + Chelsea → FIFA + bandeau Yakeey.
 * Les badges du bas sont maintenant effacés dans blank-portraits.mjs, et un
 * seul Y noir Yakeey est reposé. Ce script ne fait plus que relancer ça.
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blank = spawnSync(process.execPath, [path.join(__dirname, "blank-portraits.mjs")], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});
process.exit(blank.status || 0);

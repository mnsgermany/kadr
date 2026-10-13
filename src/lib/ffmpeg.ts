import { spawn } from "node:child_process";
import { FPS } from "./options";

// start.bat points FFMPEG_PATH at the ffmpeg bundled with imageio-ffmpeg (from PyPI),
// so nothing is downloaded from GitHub. Otherwise fall back to ffmpeg on PATH.
const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

// -r pins the output to FPS; without it ffmpeg assumes 25 fps after filters and duplicates frames.
const ENCODE = ["-r", String(FPS), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"];

// After concat, timestamps of the joined parts can leave gaps that the muxer fills
// with duplicate frames. Renumbering frames at a fixed rate avoids that.
const RETIME = `setpts=N/(${FPS}*TB)`;

function notFound(e: Error & { code?: string }) {
  return e.code === "ENOENT" ? new Error("ffmpeg не найден. Запустите КАДР через start.bat") : e;
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", ...args]);
    let err = "";
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", (e) => reject(notFound(e)));
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${err.trim() || `код ${code}`}`))));
  });
}

export function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ["-hide_banner", "-i", file]);
    let out = "";
    proc.stderr.on("data", (d) => (out += d));
    proc.on("error", (e) => reject(notFound(e)));
    proc.on("close", () => {
      const m = out.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return reject(new Error("Не удалось определить длительность видео"));
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}

// Exact frame count (container durations can be off by a frame).
function countFrames(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ["-hide_banner", "-i", file, "-map", "0:v:0", "-f", "null", "-"]);
    let out = "";
    proc.stderr.on("data", (d) => (out += d));
    proc.on("error", (e) => reject(notFound(e)));
    proc.on("close", () => {
      const all = [...out.matchAll(/frame=\s*(\d+)/g)];
      if (!all.length) return reject(new Error("Не удалось посчитать кадры видео"));
      resolve(Number(all[all.length - 1][1]));
    });
  });
}

// Joins segments. Every segment after the first starts on the previous
// segment's last frame, so that duplicate frame is dropped.
export async function concatSegments(segments: string[], out: string) {
  if (segments.length === 1) {
    await run(["-i", segments[0], ...ENCODE, out]);
    return;
  }
  const inputs = segments.flatMap((s) => ["-i", s]);
  const parts = segments.map((_, i) =>
    i === 0 ? `[0:v]setpts=PTS-STARTPTS[v0]` : `[${i}:v]trim=start_frame=1,setpts=PTS-STARTPTS[v${i}]`,
  );
  const filter = `${parts.join(";")};${segments.map((_, i) => `[v${i}]`).join("")}concat=n=${segments.length}:v=1:a=0,${RETIME}[out]`;
  await run([...inputs, "-filter_complex", filter, "-map", "[out]", ...ENCODE, out]);
}

// Seamless loop: the last `overlap` seconds dissolve into the first ones.
// Output is `overlap` seconds shorter and its last frame flows into its first.
// xfade needs an explicit constant frame rate on both inputs, hence fps=.
export async function crossfadeLoop(input: string, out: string, overlap = 1) {
  const d = await probeDuration(input);
  const o = Math.min(overlap, d / 4);
  const filter = [
    `[0:v]split[a][b]`,
    `[a]trim=start=${o},setpts=PTS-STARTPTS,fps=${FPS}[body]`,
    `[b]trim=end=${o},setpts=PTS-STARTPTS,fps=${FPS}[head]`,
    `[body][head]xfade=transition=fade:duration=${o}:offset=${(d - 2 * o).toFixed(3)}[out]`,
  ].join(";");
  await run(["-i", input, "-filter_complex", filter, "-map", "[out]", ...ENCODE, out]);
}

// Forward then backward. The reversed half skips both turnaround frames
// (the last frame, and the first frame the loop jumps back to).
export async function boomerang(input: string, out: string) {
  const frames = await countFrames(input);
  const filter = [
    `[0:v]split[f][r]`,
    `[r]reverse,trim=start_frame=1:end_frame=${frames - 1},setpts=PTS-STARTPTS[rev]`,
    `[f][rev]concat=n=2:v=1:a=0,${RETIME}[out]`,
  ].join(";");
  await run(["-i", input, "-filter_complex", filter, "-map", "[out]", ...ENCODE, out]);
}

export async function thumbnail(input: string, out: string) {
  await run(["-ss", "0.5", "-i", input, "-frames:v", "1", "-vf", "scale=640:-2", out]);
}

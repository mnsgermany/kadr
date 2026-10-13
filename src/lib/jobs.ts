import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { annotated, downloadFile, interrupt, runPrompt, type ComfyFile } from "./comfy";
import { boomerang, concatSegments, crossfadeLoop, probeDuration, thumbnail } from "./ffmpeg";
import { STYLES, type GenerateRequest } from "./options";
import { buildSegmentWorkflow } from "./workflow";

export const DATA_DIR = path.resolve(process.env.KADR_DATA_DIR ?? "data");
const JOBS_DIR = path.join(DATA_DIR, "jobs");

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export interface Job {
  id: string;
  createdAt: string;
  request: GenerateRequest & { seed: number };
  status: JobStatus;
  stage: string;
  progress: number; // 0..1
  error?: string;
  duration?: number; // seconds, of the final video
  startedAt?: string;
  finishedAt?: string;
}

interface Store {
  jobs: Map<string, Job>;
  queue: string[];
  running: string | null;
  loaded: boolean;
}

// Survives Next.js dev hot reloads.
const g = globalThis as unknown as { __kadr?: Store };
const store: Store = (g.__kadr ??= { jobs: new Map(), queue: [], running: null, loaded: false });

export const jobDir = (id: string) => path.join(JOBS_DIR, id);
export const videoPath = (id: string) => path.join(jobDir(id), "video.mp4");
export const thumbPath = (id: string) => path.join(jobDir(id), "thumb.jpg");

async function save(job: Job) {
  await fs.mkdir(jobDir(job.id), { recursive: true });
  await fs.writeFile(path.join(jobDir(job.id), "job.json"), JSON.stringify(job, null, 2));
}

async function load() {
  if (store.loaded) return;
  store.loaded = true;
  await fs.mkdir(JOBS_DIR, { recursive: true });
  for (const id of await fs.readdir(JOBS_DIR)) {
    try {
      const job: Job = JSON.parse(await fs.readFile(path.join(jobDir(id), "job.json"), "utf8"));
      // Anything unfinished when the server stopped cannot be resumed.
      if (job.status === "queued" || job.status === "running") {
        job.status = "error";
        job.error = "Сервер был перезапущен во время генерации";
        await save(job);
      }
      store.jobs.set(id, job);
    } catch {
      // Not a job folder.
    }
  }
}

export async function listJobs(): Promise<Job[]> {
  await load();
  return [...store.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getJob(id: string): Promise<Job | undefined> {
  await load();
  return store.jobs.get(id);
}

export async function createJob(req: GenerateRequest): Promise<Job> {
  await load();
  const job: Job = {
    id: `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    request: { ...req, seed: req.seed ?? Math.floor(Math.random() * 2 ** 48) },
    status: "queued",
    stage: "В очереди",
    progress: 0,
  };
  store.jobs.set(job.id, job);
  store.queue.push(job.id);
  await save(job);
  void pump();
  return job;
}

export async function cancelJob(id: string) {
  const job = await getJob(id);
  if (!job) return;
  if (job.status === "queued") {
    store.queue = store.queue.filter((q) => q !== id);
    Object.assign(job, { status: "cancelled", stage: "Отменено" });
    await save(job);
  } else if (job.status === "running") {
    Object.assign(job, { status: "cancelled", stage: "Отменено" });
    await interrupt();
  }
}

export async function deleteJob(id: string) {
  const job = await getJob(id);
  if (!job || job.status === "running" || job.status === "queued") return false;
  store.jobs.delete(id);
  await fs.rm(jobDir(id), { recursive: true, force: true });
  return true;
}

async function pump() {
  if (store.running) return;
  const id = store.queue.shift();
  if (!id) return;
  const job = store.jobs.get(id)!;
  store.running = id;
  try {
    await execute(job);
  } catch (e) {
    if (job.status !== "cancelled") {
      job.status = "error";
      job.error = e instanceof Error ? e.message : String(e);
      job.stage = "Ошибка";
    }
  } finally {
    job.finishedAt = new Date().toISOString();
    await save(job).catch(() => {});
    store.running = null;
    void pump();
  }
}

function fullPrompt(req: GenerateRequest) {
  const style = STYLES.find((s) => s.id === req.style)?.suffix;
  return style ? `${req.prompt.trim()}\n\nStyle: ${style}.` : req.prompt.trim();
}

async function execute(job: Job) {
  const req = job.request;
  const dir = jobDir(job.id);
  const segments = Math.max(1, Math.round(req.duration / 5));
  const update = async (stage: string, progress: number) => {
    if (job.status === "cancelled") throw new Error("Отменено");
    job.stage = stage;
    job.progress = progress;
    await save(job);
  };

  job.status = "running";
  job.startedAt = new Date().toISOString();
  // Post-processing gets the last 5% of the bar.
  const genShare = 0.95;

  const files: string[] = [];
  let startImage: string | undefined;
  for (let i = 0; i < segments; i++) {
    const base = (i / segments) * genShare;
    const label = segments > 1 ? `Генерация части ${i + 1} из ${segments}` : "Генерация";
    await update(`${label}: загрузка модели`, base);

    const wf = buildSegmentWorkflow({
      prompt: fullPrompt(req),
      aspect: req.aspect,
      seed: req.seed + i,
      upscale: req.upscale,
      startImage,
      prefix: `kadr/${job.id}/seg${i}`,
    });
    let lastSaved = 0;
    const outputs = await runPrompt(wf, (f) => {
      job.stage = `${label}: шаг ${Math.round(f * 20)} из 20`;
      job.progress = base + (f * genShare) / segments;
      if (Date.now() - lastSaved > 2000) {
        lastSaved = Date.now();
        void save(job);
      }
    });
    if ((job.status as JobStatus) === "cancelled") throw new Error("Отменено");

    const video = outputs.save?.images?.[0];
    const last = outputs.last?.images?.[0] as ComfyFile | undefined;
    if (!video || !last) throw new Error("ComfyUI не вернул видео");
    const file = path.join(dir, `seg${i}.mp4`);
    await downloadFile(video, file);
    files.push(file);
    startImage = annotated(last);
  }

  await update("Склейка и финальный рендер", genShare);
  const joined = path.join(dir, "joined.mp4");
  await concatSegments(files, joined);

  const final = videoPath(job.id);
  if (req.loop === "crossfade") {
    await update("Делаю плавный loop", 0.97);
    await crossfadeLoop(joined, final);
  } else if (req.loop === "boomerang") {
    await update("Делаю бумеранг", 0.97);
    await boomerang(joined, final);
  } else {
    await fs.rename(joined, final);
  }
  await fs.rm(joined, { force: true });
  for (const f of files) await fs.rm(f, { force: true });

  await thumbnail(final, thumbPath(job.id)).catch(() => {});
  job.duration = await probeDuration(final).catch(() => undefined);
  job.status = "done";
  job.stage = "Готово";
  job.progress = 1;
}

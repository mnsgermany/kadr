import { createJob, listJobs } from "@/lib/jobs";
import { DURATIONS, LOOP_MODES, MAX_PROMPT, STYLES, UPSCALE_MODES, type GenerateRequest } from "@/lib/options";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listJobs());
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Partial<GenerateRequest>;
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (!prompt) return Response.json({ error: "Опиши идею видео" }, { status: 400 });
  if (prompt.length > MAX_PROMPT) return Response.json({ error: `Не длиннее ${MAX_PROMPT} символов` }, { status: 400 });

  const job = await createJob({
    prompt,
    style: STYLES.some((s) => s.id === b.style) ? b.style! : "none",
    aspect: b.aspect === "9:16" ? "9:16" : "16:9",
    duration: DURATIONS.includes(Number(b.duration)) ? Number(b.duration) : 5,
    loop: LOOP_MODES.some((l) => l.id === b.loop) ? b.loop! : "none",
    upscale: UPSCALE_MODES.some((u) => u.id === b.upscale) ? b.upscale! : "ai",
    seed: Number.isSafeInteger(b.seed) ? b.seed : undefined,
  });
  return Response.json(job, { status: 201 });
}

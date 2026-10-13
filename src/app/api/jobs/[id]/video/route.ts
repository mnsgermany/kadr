import { getJob, videoPath } from "@/lib/jobs";
import { serveFile } from "@/lib/serve";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = await getJob((await params).id);
  if (!job || job.status !== "done") return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  return serveFile(req, videoPath(job.id), "video/mp4", download ? `kadr-${job.id}.mp4` : undefined);
}

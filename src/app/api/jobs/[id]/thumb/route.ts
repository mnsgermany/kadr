import { getJob, thumbPath } from "@/lib/jobs";
import { serveFile } from "@/lib/serve";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = await getJob((await params).id);
  if (!job) return new Response("Not found", { status: 404 });
  return serveFile(req, thumbPath(job.id), "image/jpeg");
}

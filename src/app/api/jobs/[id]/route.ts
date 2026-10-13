import { cancelJob, deleteJob, getJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const job = await getJob((await params).id);
  return job ? Response.json(job) : Response.json({ error: "Не найдено" }, { status: 404 });
}

// POST = cancel, DELETE = remove a finished job and its files.
export async function POST(_: Request, { params }: Ctx) {
  await cancelJob((await params).id);
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const ok = await deleteJob((await params).id);
  return Response.json({ ok }, { status: ok ? 200 : 409 });
}

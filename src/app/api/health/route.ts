import { COMFY_URL, comfyAlive } from "@/lib/comfy";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ comfy: await comfyAlive(), comfyUrl: COMFY_URL });
}

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

export const COMFY_URL = (process.env.COMFY_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");

const clientId = randomUUID();

export interface ComfyFile {
  filename: string;
  subfolder: string;
  type: string;
}

export async function comfyAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${COMFY_URL}/system_stats`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function systemStats(): Promise<unknown> {
  const res = await fetch(`${COMFY_URL}/system_stats`, { signal: AbortSignal.timeout(2000) });
  return res.json();
}

// Queues a prompt and resolves with its outputs once ComfyUI has executed it.
// onProgress receives the id of the node now running and, for nodes that
// report it (sampler steps, upscale tiles), how far along it is (0..1).
export async function runPrompt(
  prompt: Record<string, unknown>,
  onProgress: (node: string, fraction?: number) => void,
): Promise<Record<string, { images?: ComfyFile[] }>> {
  const ws = new WebSocket(`${COMFY_URL.replace(/^http/, "ws")}/ws?clientId=${clientId}`);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("Не удалось подключиться к ComfyUI"));
  });

  try {
    const res = await fetch(`${COMFY_URL}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, client_id: clientId }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`ComfyUI отклонил задание: ${JSON.stringify(body.node_errors ?? body.error ?? body)}`);
    }
    const promptId: string = body.prompt_id;

    await new Promise<void>((resolve, reject) => {
      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        const msg = JSON.parse(ev.data);
        const d = msg.data ?? {};
        if (d.prompt_id !== promptId) return;
        if (msg.type === "executing" && d.node) onProgress(d.node);
        if (msg.type === "progress" && d.max > 1 && d.node) onProgress(d.node, d.value / d.max);
        if (msg.type === "execution_success") resolve();
        if (msg.type === "execution_error") reject(new Error(`Ошибка ComfyUI: ${d.exception_message ?? "неизвестная"}`));
        if (msg.type === "execution_interrupted") reject(new Error("Генерация прервана"));
      };
      ws.onclose = () => reject(new Error("Соединение с ComfyUI оборвалось"));
    });

    const hist = await (await fetch(`${COMFY_URL}/history/${promptId}`)).json();
    return hist[promptId]?.outputs ?? {};
  } finally {
    ws.onclose = null;
    ws.close();
  }
}

export async function downloadFile(file: ComfyFile, dest: string) {
  const qs = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type });
  const res = await fetch(`${COMFY_URL}/view?${qs}`);
  if (!res.ok) throw new Error(`Не удалось скачать ${file.filename} из ComfyUI`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

// "sub/folder/file.png [output]" — lets LoadImage read straight from ComfyUI's output dir.
export function annotated(file: ComfyFile) {
  return `${file.subfolder ? `${file.subfolder}/` : ""}${file.filename} [${file.type}]`;
}

export async function interrupt() {
  await fetch(`${COMFY_URL}/interrupt`, { method: "POST" }).catch(() => {});
}

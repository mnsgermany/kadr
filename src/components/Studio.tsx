"use client";

import {
  Aperture, ArrowRight, ArrowUpRight, Clock, Download, Film, Lightbulb, Loader2, Monitor, Plus,
  RectangleHorizontal, RectangleVertical, Repeat, Sparkles, Trash2, Wand2, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Job } from "@/lib/jobs";
import {
  DURATIONS, EXAMPLES, LOOP_MODES, MAX_PROMPT, STYLES, UPSCALE_MODES,
  type Aspect, type LoopMode, type UpscaleMode,
} from "@/lib/options";

const DEFAULT_PROMPT = EXAMPLES[0].prompt;

export default function Studio() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [style, setStyle] = useState("3d");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [duration, setDuration] = useState(5);
  const [loop, setLoop] = useState<LoopMode>("none");
  const [upscale, setUpscale] = useState<UpscaleMode>("ai");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [comfy, setComfy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/jobs").catch(() => null);
    if (res?.ok) setJobs(await res.json());
  }, []);

  useEffect(() => {
    refresh();
    const checkComfy = () =>
      fetch("/api/health").then((r) => r.json()).then((h) => setComfy(h.comfy)).catch(() => setComfy(false));
    checkComfy();
    const t = setInterval(checkComfy, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const active = jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [active, refresh]);

  const current = jobs.find((j) => j.id === selected) ?? jobs[0];

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, style, aspect, duration, loop, upscale }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Не получилось");
      setSelected(body.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function pickExample(i: number) {
    setPrompt(EXAMPLES[i].prompt);
    setStyle(EXAMPLES[i].style);
    createRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  const loopHint = LOOP_MODES.find((l) => l.id === loop)?.hint;
  const finalSeconds = loop === "crossfade" ? duration - 1 : loop === "boomerang" ? duration * 2 : duration;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel p-5 lg:flex">
        <div className="flex items-center gap-2">
          <Aperture className="h-7 w-7 text-accent" />
          <span className="text-2xl font-bold tracking-tight">КАДР.</span>
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">BETA</span>
        </div>
        <p className="mt-8 text-[11px] uppercase tracking-[0.2em] text-muted">Твоя студия</p>
        <nav className="mt-3 space-y-1 text-sm">
          <a href="#create" className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-accent">
            <Film className="h-4 w-4" /> Создать видео
          </a>
          <a href="#library" className="flex items-center gap-2 rounded-lg px-3 py-2 text-muted hover:text-foreground">
            <Monitor className="h-4 w-4" /> Мои видео
          </a>
          <a href="#inspiration" className="flex items-center gap-2 rounded-lg px-3 py-2 text-muted hover:text-foreground">
            <Sparkles className="h-4 w-4" /> Вдохновение
          </a>
          <button
            onClick={() => { setPrompt(""); createRef.current?.scrollIntoView({ behavior: "smooth" }); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4" /> Новая идея
          </button>
        </nav>
        <div className="mt-auto rounded-xl border border-line p-4 text-xs text-muted">
          <Lightbulb className="mb-2 h-4 w-4 text-accent" />
          Большое кино начинается с маленькой идеи. Опиши, кто в кадре, что он делает и как движется камера.
        </div>
        <div className="mt-4 flex items-center justify-between text-[11px] text-muted">
          <span>КАДР STUDIO</span>
          <ComfyBadge ok={comfy} />
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-8">
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-2">
            <Aperture className="h-6 w-6 text-accent" />
            <span className="text-xl font-bold tracking-tight">КАДР.</span>
          </div>
          <ComfyBadge ok={comfy} />
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-r from-panel via-slate-900 to-cyan-950 px-6 py-8">
          <h1 className="text-2xl font-semibold sm:text-3xl">Превращай слова в истории, которые хочется смотреть.</h1>
          <p className="mt-2 text-sm text-muted">Генерация видео прямо на твоём компьютере: Full HD, до 15 секунд, с зацикливанием.</p>
          <span className="absolute bottom-3 right-4 text-[10px] uppercase tracking-[0.2em] text-muted">Воображение без границ</span>
        </div>

        {comfy === false && (
          <div className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/40 p-4 text-sm text-amber-200">
            ComfyUI не запущен. Открой <b>start.bat</b> в папке КАДР (или запусти ComfyUI вручную), и статус обновится сам.
          </div>
        )}

        <div id="create" ref={createRef} className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-line bg-panel p-5">
            <header className="flex items-center justify-between border-b border-line pb-4">
              <h2 className="flex items-center gap-2 font-medium"><Wand2 className="h-4 w-4 text-accent" /> Создать видео</h2>
              <span className="text-xs text-muted">Текст → Видео</span>
            </header>

            <div className="mt-4 flex items-center justify-between text-xs">
              <label htmlFor="prompt" className="text-muted">Твоя идея</label>
              <button
                onClick={() => pickExample(Math.floor(Math.random() * EXAMPLES.length))}
                className="flex items-center gap-1 text-accent hover:underline"
              >
                <Sparkles className="h-3 w-3" /> Попробовать пример
              </button>
            </div>
            <textarea
              id="prompt"
              value={prompt}
              maxLength={MAX_PROMPT}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="Кто в кадре, что происходит, как движется камера, какой свет…"
              className="mt-2 w-full resize-y rounded-xl border border-line bg-panel-2 p-3 text-sm leading-relaxed outline-none focus:border-accent/60"
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>Больше деталей — точнее результат</span>
              <span>{prompt.length} / {MAX_PROMPT}</span>
            </div>

            <Field label="Визуальный стиль">
              <select value={style} onChange={(e) => setStyle(e.target.value)} className={selectCls}>
                {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Формат">
                <div className="grid grid-cols-2 gap-2">
                  {(["16:9", "9:16"] as Aspect[]).map((a) => (
                    <button key={a} onClick={() => setAspect(a)} className={toggleCls(aspect === a)}>
                      {a === "16:9" ? <RectangleHorizontal className="h-4 w-4" /> : <RectangleVertical className="h-4 w-4" />} {a}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Длительность">
                <div className="relative">
                  <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={`${selectCls} pl-9`}>
                    {DURATIONS.map((d) => <option key={d} value={d}>{d} секунд</option>)}
                  </select>
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Зацикливание">
                <div className="relative">
                  <Repeat className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <select value={loop} onChange={(e) => setLoop(e.target.value as LoopMode)} className={`${selectCls} pl-9`}>
                    {LOOP_MODES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
              </Field>
              <Field label="Апскейл до Full HD">
                <select value={upscale} onChange={(e) => setUpscale(e.target.value as UpscaleMode)} className={selectCls}>
                  {UPSCALE_MODES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </Field>
            </div>
            {loopHint && <p className="-mt-2 mb-2 text-[11px] text-muted">{loopHint}</p>}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
              <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-accent" /> Wan 2.2 5B · локально</span>
              <span>1080p · {finalSeconds} с · без звука · бесплатно</span>
            </div>

            <button
              onClick={submit}
              disabled={submitting || !prompt.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-medium text-accent-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Создать видео <ArrowRight className="h-4 w-4" />
            </button>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <p className="mt-3 text-center text-[11px] text-muted">Твоя идея. Искусственный интеллект. Настоящее видео.</p>
          </section>

          <Preview job={current} onChanged={refresh} />
        </div>

        <section id="inspiration" className="mt-10">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-lg font-medium">Немного вдохновения</h2>
              <p className="text-xs text-muted">Любая история начинается с «а что, если…»</p>
            </div>
            <span className="hidden text-xs text-muted sm:block">Выбери идею и сделай её своей</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {EXAMPLES.map((ex, i) => (
              <button key={ex.title} onClick={() => pickExample(i)} className="group overflow-hidden rounded-2xl border border-line bg-panel text-left">
                <div className={`relative h-40 bg-gradient-to-br ${ex.gradient}`}>
                  <span className="absolute left-3 top-3 rounded bg-black/50 px-2 py-0.5 text-[10px]">
                    {STYLES.find((s) => s.id === ex.style)?.label}
                  </span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm">{ex.title}</p>
                    <p className="text-[11px] text-muted">Использовать описание</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-accent" />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section id="library" className="mt-10">
          <h2 className="text-lg font-medium">Мои видео</h2>
          {jobs.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Пока пусто. Первое видео появится здесь.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              {jobs.map((j) => (
                <button
                  key={j.id}
                  onClick={() => { setSelected(j.id); createRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                  className={`overflow-hidden rounded-xl border text-left ${current?.id === j.id ? "border-accent" : "border-line"} bg-panel`}
                >
                  <div className="flex aspect-video items-center justify-center bg-panel-2">
                    {j.status === "done" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/jobs/${j.id}/thumb`} alt="" className="h-full w-full object-cover" />
                    ) : j.status === "error" || j.status === "cancelled" ? (
                      <X className="h-5 w-5 text-muted" />
                    ) : (
                      <span className="text-xs text-muted">{Math.round(j.progress * 100)}%</span>
                    )}
                  </div>
                  <p className="line-clamp-2 p-2 text-[11px] text-muted">{j.request.prompt}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Preview({ job, onChanged }: { job?: Job; onChanged: () => void }) {
  const busy = job && (job.status === "queued" || job.status === "running");
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-panel p-5">
      <header className="flex items-center justify-between border-b border-line pb-4">
        <h2 className="flex items-center gap-2 font-medium"><Film className="h-4 w-4 text-accent" /> Предпросмотр</h2>
        <span className="text-xs text-muted">
          {!job ? "В ожидании идеи" : job.stage}
        </span>
      </header>

      <div className="mt-4 flex min-h-72 flex-1 items-center justify-center rounded-xl border border-dashed border-line bg-panel-2">
        {!job && (
          <div className="p-6 text-center">
            <Film className="mx-auto h-10 w-10 text-muted" />
            <p className="mt-3">Здесь оживёт твоя идея</p>
            <p className="mt-1 text-sm text-muted">Опиши сцену, настрой детали и нажми «Создать видео»</p>
          </div>
        )}
        {job?.status === "done" && (
          <video
            key={job.id}
            src={`/api/jobs/${job.id}/video`}
            controls
            autoPlay
            loop
            muted
            playsInline
            className="max-h-[480px] w-full rounded-xl"
          />
        )}
        {busy && (
          <div className="w-full max-w-sm p-6 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-accent" />
            <p className="mt-3 text-sm">{job.stage}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.max(2, job.progress * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">{Math.round(job.progress * 100)}% · можно закрыть вкладку, генерация продолжится</p>
            <button
              onClick={async () => { await fetch(`/api/jobs/${job.id}`, { method: "POST" }); onChanged(); }}
              className="mt-4 text-xs text-muted underline hover:text-foreground"
            >
              Отменить
            </button>
          </div>
        )}
        {(job?.status === "error" || job?.status === "cancelled") && (
          <div className="p-6 text-center">
            <X className="mx-auto h-8 w-8 text-red-400" />
            <p className="mt-3 text-sm">{job.status === "cancelled" ? "Генерация отменена" : "Не получилось"}</p>
            {job.error && <p className="mt-1 max-w-md break-words text-xs text-muted">{job.error}</p>}
          </div>
        )}
      </div>

      <footer className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>MP4 · 1080p · без звука{job?.duration ? ` · ${job.duration.toFixed(1)} с` : ""}</span>
        <div className="flex items-center gap-4">
          {job && !busy && (
            <button
              onClick={async () => { await fetch(`/api/jobs/${job.id}`, { method: "DELETE" }); onChanged(); }}
              className="flex items-center gap-1 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" /> Удалить
            </button>
          )}
          {job?.status === "done" ? (
            <a href={`/api/jobs/${job.id}/video?download`} className="flex items-center gap-1 text-accent hover:underline">
              <Download className="h-3 w-3" /> Скачать MP4
            </a>
          ) : (
            <span className="flex items-center gap-1"><Download className="h-3 w-3" /> Скачай после создания</span>
          )}
        </div>
      </footer>
    </section>
  );
}

function ComfyBadge({ ok }: { ok: boolean | null }) {
  const color = ok === null ? "bg-muted" : ok ? "bg-accent" : "bg-red-500";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} /> {ok ? "ComfyUI" : ok === null ? "…" : "нет связи"}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-muted">{label}</p>
      {children}
    </div>
  );
}

const selectCls =
  "w-full appearance-none rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-sm outline-none focus:border-accent/60";

const toggleCls = (on: boolean) =>
  `flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-sm ${
    on ? "border-accent/60 bg-accent/10 text-accent" : "border-line bg-panel-2 text-muted hover:text-foreground"
  }`;

// Options shared by the UI and the server. Keep this file free of Node imports.

export type Aspect = "16:9" | "9:16";
export type LoopMode = "none" | "crossfade" | "boomerang";
export type UpscaleMode = "ai" | "fast";

export interface GenerateRequest {
  prompt: string;
  style: string;
  aspect: Aspect;
  duration: number;
  loop: LoopMode;
  upscale: UpscaleMode;
  seed?: number;
}

export const MAX_PROMPT = 1500;

export const STYLES: { id: string; label: string; suffix: string }[] = [
  { id: "cinematic", label: "Кинематограф", suffix: "cinematic film still, shallow depth of field, natural film grain, dramatic lighting" },
  { id: "3d", label: "3D-анимация", suffix: "3D animated movie style, Pixar-like, soft global illumination, vibrant colors" },
  { id: "realistic", label: "Реализм", suffix: "photorealistic, ultra detailed, natural light, documentary footage" },
  { id: "anime", label: "Аниме", suffix: "anime style, cel shading, hand-drawn look, expressive colors" },
  { id: "fantasy", label: "Фантастика", suffix: "epic sci-fi fantasy, otherworldly landscape, volumetric light, concept art" },
  { id: "none", label: "Без стиля", suffix: "" },
];

// One Wan 2.2 5B pass is 121 frames at 24 fps (~5 s); longer videos chain passes.
export const DURATIONS = [5, 10, 15];
export const FPS = 24;
export const SEGMENT_FRAMES = 121;

export const LOOP_MODES: { id: LoopMode; label: string; hint: string }[] = [
  { id: "none", label: "Без зацикливания", hint: "" },
  { id: "crossfade", label: "Плавный loop", hint: "Конец мягко перетекает в начало, ролик становится на ~1 с короче" },
  { id: "boomerang", label: "Бумеранг", hint: "Вперёд и обратно, длительность ×2" },
];

export const UPSCALE_MODES: { id: UpscaleMode; label: string; hint: string }[] = [
  { id: "ai", label: "ИИ-апскейл", hint: "Real-ESRGAN ×2, чётче, но дольше" },
  { id: "fast", label: "Быстрый", hint: "Обычное масштабирование" },
];

export function generationSize(aspect: Aspect) {
  return aspect === "16:9" ? { width: 1280, height: 704 } : { width: 704, height: 1280 };
}

export function outputSize(aspect: Aspect) {
  return aspect === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
}

export const EXAMPLES: { title: string; style: string; prompt: string; gradient: string }[] = [
  {
    title: "Навстречу приключениям",
    style: "3d",
    prompt:
      "Весёлая маленькая мартышка едет на мятном велосипеде по дорожке солнечного парка. Крутит педали и оглядывается на камеру. Камера плавно следует сбоку, сквозь деревья пробиваются тёплые лучи солнца.",
    gradient: "from-emerald-700 via-lime-600 to-amber-400",
  },
  {
    title: "Там, где дышит океан",
    style: "cinematic",
    prompt:
      "Тёмные скалистые берега, тяжёлые волны разбиваются о камни и рассыпаются белой пеной. Над океаном низкие облака, сквозь них пробивается закатный свет. Камера медленно пролетает вдоль берега.",
    gradient: "from-slate-800 via-sky-800 to-cyan-500",
  },
  {
    title: "За пределами привычного",
    style: "fantasy",
    prompt:
      "Астронавт в белом скафандре идёт по рыжей каменистой пустыне чужой планеты. Над горизонтом висит огромная полосатая планета, в небе пыльная дымка. Камера медленно отъезжает назад.",
    gradient: "from-orange-900 via-orange-600 to-amber-300",
  },
];

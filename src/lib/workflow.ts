import { Aspect, FPS, SEGMENT_FRAMES, UpscaleMode, generationSize, outputSize } from "./options";

// Model files the installer downloads into ComfyUI/models.
export const MODELS = {
  unet: "wan2.2_ti2v_5B_fp16.safetensors",
  clip: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
  vae: "wan2.2_vae.safetensors",
  upscaler: "RealESRGAN_x2plus.pth",
};

// Official negative prompt from the Wan 2.2 ComfyUI template.
const NEGATIVE =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

export interface SegmentParams {
  prompt: string;
  aspect: Aspect;
  seed: number;
  upscale: UpscaleMode;
  // Annotated ComfyUI path ("sub/file.png [output]") of the frame to continue from.
  startImage?: string;
  prefix: string;
  steps?: number;
}

type Node = { class_type: string; inputs: Record<string, unknown> };

// Builds a ComfyUI API-format prompt for one ~5 s Wan 2.2 TI2V 5B segment.
// Outputs: "save" (upscaled MP4) and "last" (last frame at generation size,
// used as the start image of the next segment).
export function buildSegmentWorkflow(p: SegmentParams): Record<string, Node> {
  const gen = generationSize(p.aspect);
  const out = outputSize(p.aspect);

  const wf: Record<string, Node> = {
    unet: { class_type: "UNETLoader", inputs: { unet_name: MODELS.unet, weight_dtype: "default" } },
    clip: { class_type: "CLIPLoader", inputs: { clip_name: MODELS.clip, type: "wan", device: "default" } },
    vae: { class_type: "VAELoader", inputs: { vae_name: MODELS.vae } },
    shift: { class_type: "ModelSamplingSD3", inputs: { model: ["unet", 0], shift: 8 } },
    pos: { class_type: "CLIPTextEncode", inputs: { clip: ["clip", 0], text: p.prompt } },
    neg: { class_type: "CLIPTextEncode", inputs: { clip: ["clip", 0], text: NEGATIVE } },
    latent: {
      class_type: "Wan22ImageToVideoLatent",
      inputs: { vae: ["vae", 0], width: gen.width, height: gen.height, length: SEGMENT_FRAMES, batch_size: 1 },
    },
    sampler: {
      class_type: "KSampler",
      inputs: {
        model: ["shift", 0],
        positive: ["pos", 0],
        negative: ["neg", 0],
        latent_image: ["latent", 0],
        seed: p.seed,
        steps: p.steps ?? 20,
        cfg: 5,
        sampler_name: "uni_pc",
        scheduler: "simple",
        denoise: 1,
      },
    },
    decode: { class_type: "VAEDecode", inputs: { samples: ["sampler", 0], vae: ["vae", 0] } },
    lastFrame: {
      class_type: "ImageFromBatch",
      inputs: { image: ["decode", 0], batch_index: -1, length: 1 },
    },
    last: { class_type: "SaveImage", inputs: { images: ["lastFrame", 0], filename_prefix: `${p.prefix}_last` } },
  };

  if (p.startImage) {
    wf.start = { class_type: "LoadImage", inputs: { image: p.startImage } };
    wf.latent.inputs.start_image = ["start", 0];
  }

  let frames: [string, number] = ["decode", 0];
  if (p.upscale === "ai") {
    wf.upLoader = { class_type: "UpscaleModelLoader", inputs: { model_name: MODELS.upscaler } };
    wf.upscale = { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["upLoader", 0], image: frames } };
    frames = ["upscale", 0];
  }
  wf.resize = {
    class_type: "ImageScale",
    inputs: { image: frames, upscale_method: "lanczos", width: out.width, height: out.height, crop: "center" },
  };
  wf.video = { class_type: "CreateVideo", inputs: { images: ["resize", 0], fps: FPS } };
  // SaveVideo's format/codec are dynamic combos, flattened with dot keys in API prompts.
  wf.save = {
    class_type: "SaveVideo",
    inputs: { video: ["video", 0], filename_prefix: p.prefix, format: "mp4", "format.codec": "auto" },
  };
  return wf;
}

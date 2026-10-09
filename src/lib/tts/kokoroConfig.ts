import type { KokoroBackend } from './kokoro.worker'

export const KOKORO_REPO = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main'

// q8 runs on the CPU; on WebGPU only the fp32 weights are both fast and correct
// (the q8 graph falls back to the CPU there and fp16 produces NaNs)
export const KOKORO_MODEL_FILE: Record<KokoroBackend, string> = {
  wasm: 'model_quantized.onnx',
  webgpu: 'model.onnx',
}

export const kokoroModelUrl = (backend: KokoroBackend) =>
  `${KOKORO_REPO}/onnx/${KOKORO_MODEL_FILE[backend]}`

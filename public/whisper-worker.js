// Dictée de haute qualité : Whisper exécuté localement dans le navigateur (transformers.js).
// Le modèle est téléchargé une seule fois depuis Hugging Face puis gardé en cache par le navigateur.
// Ensuite, tout se passe sur le PC : rien n'est envoyé à un service de transcription.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

env.allowLocalModels = false;

let asr = null;
let current = null;
let loading = null;

async function pickDevice() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter && adapter.features.has('shader-f16')) return 'webgpu';
  } catch {}
  return 'wasm';
}

async function load(model) {
  if (asr && current === model) return asr;
  if (loading && loading.model === model) return loading.promise;
  const promise = (async () => {
    const device = await pickDevice();
    // carte graphique : encodeur en fp16, décodeur quantifié ; sinon processeur avec poids 8 bits
    const dtype = device === 'webgpu' ? { encoder_model: 'fp16', decoder_model_merged: 'q4' } : 'q8';
    const p = await pipeline('automatic-speech-recognition', model, {
      device,
      dtype,
      progress_callback: (e) => {
        if (e.status === 'progress' && e.total) postMessage({ type: 'progress', file: e.file, loaded: e.loaded, total: e.total });
      },
    });
    asr = p;
    current = model;
    postMessage({ type: 'ready', model, device });
    return p;
  })();
  loading = { model, promise };
  try {
    return await promise;
  } finally {
    loading = null;
  }
}

onmessage = async (e) => {
  const { id, type, model, audio } = e.data;
  try {
    if (type === 'load') {
      await load(model);
      postMessage({ id, type: 'loaded' });
    } else if (type === 'transcribe') {
      const t = await load(model);
      const out = await t(audio, { language: 'french', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
      postMessage({ id, type: 'result', text: (out.text || '').trim() });
    }
  } catch (err) {
    postMessage({ id, type: 'error', message: String(err?.message || err) });
  }
};

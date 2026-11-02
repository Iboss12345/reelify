// Runs Meta's MusicGen (small) in a background thread so the page doesn't freeze while it composes.
import { AutoTokenizer, MusicgenForConditionalGeneration } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1';

const MODEL = 'Xenova/musicgen-small';
let ready = null;
const files = {};

function load() {
  if (!ready) {
    const progress_callback = (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files[p.file] = p;
      const all = Object.values(files);
      self.postMessage({ type: 'download', loaded: all.reduce((a, f) => a + f.loaded, 0), total: all.reduce((a, f) => a + f.total, 0) });
    };
    ready = Promise.all([
      AutoTokenizer.from_pretrained(MODEL),
      MusicgenForConditionalGeneration.from_pretrained(MODEL, {
        dtype: { text_encoder: 'q8', decoder_model_merged: 'q8', encodec_decode: 'fp32' },
        device: 'wasm',
        progress_callback,
      }),
    ]);
    ready.catch(() => { ready = null; });
  }
  return ready;
}

self.onmessage = async ({ data: { prompt, tokens } }) => {
  try {
    const [tokenizer, model] = await load();
    let step = 0;
    const streamer = { put() { step++; if (step % 10 === 0) self.postMessage({ type: 'step', step, tokens }); }, end() {} };
    const audio = await model.generate({ ...tokenizer(prompt), max_new_tokens: tokens, do_sample: true, guidance_scale: 3, streamer });
    const samples = new Float32Array(audio.data);
    self.postMessage({ type: 'done', samples, rate: model.config.audio_encoder.sampling_rate }, [samples.buffer]);
  } catch (e) {
    self.postMessage({ type: 'error', message: String((e && e.message) || e) });
  }
};

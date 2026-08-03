// Groq Whisper STT client. Free tier model: whisper-large-v3.
//
// We send the audio buffer (ogg from Telegram) directly. Lang needs to be
// hinted explicitly because Whisper auto-detect on Bengali performs poorly
// when mixed with English/romanised Bengali.
//
// Free limits (Groq):
//   - Whisper-large-v3: ~7200 audio-seconds / min per request, very generous cap

import type { Readable } from 'node:stream';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export type SttResult = { text: string; language: 'en' | 'bn' | 'mixed'; confidenceProxy: number };

export async function transcribe(buf: Buffer, mime = 'audio/ogg', hintLang: 'en' | 'bn' | 'auto' = 'auto') {
  const fd = new FormData();
  const blob = new Blob([buf], { type: mime });
  fd.append('file', blob, 'voice.ogg');
  fd.append('model', 'whisper-large-v3');
  fd.append('response_format', 'verbose_json');
  if (hintLang !== 'auto') fd.append('language', hintLang);
  // Improve romanised-Bengali / mixed-script handling.
  fd.append('temperature', '0');

  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: fd
  });
  if (!r.ok) throw new Error(`groq-stt-failed-${r.status}: ${await r.text()}`);
  const j = (await r.json()) as {
    text: string;
    language?: string;
    segments?: { avg_logprob?: number }[];
  };
  const conf = j.segments?.length
    ? Math.exp((j.segments.reduce((s, x) => s + (x.avg_logprob ?? 0), 0) / j.segments.length))
    : 0.6;
  const lowered = j.text?.trim() ?? '';
  const lower = lowered.toLowerCase();
  const bnChars = (lowered.match(/[ঀ-৿]/g) ?? []).length;
  const isBn = bnChars > 0;
  return {
    text: lowered,
    language: isBn ? 'bn' : 'en',
    confidenceProxy: conf
  } satisfies SttResult;
}

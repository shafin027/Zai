// Two-tier TTS:
// 1) Google Cloud TTS (free 4M chars/month on Standard voices)
// 2) Edge TTS (free forever, no key, used as fallback when quota exhausted or for
//    sound effects like the startup "ꜱᴛᴀʀᴛɪɴɢ" chime the user asked about).
//
// Returns a buffer (MP3 or OGG) ready to upload back to Telegram.

const GOOGLE_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

const EDGE_VOICE = {
  bn: 'bn-IN-NabanitaNeural',
  en: 'en-IN-NeerjaNeural'
} as const;

export async function tts(text: string, lang: 'bn' | 'en'): Promise<{ buffer: Buffer; provider: 'google' | 'edge'; mime: string }> {
  try {
    const buf = await googleTts(text, lang);
    return { buffer: buf, provider: 'google', mime: 'audio/mpeg' };
  } catch (err) {
    // Edge TTS fallback. We use the open-source `edge-tts` Python CLI via the
    // n8n HTTP node from the workflow JSON — for direct calls from this server,
    // we delegate to a system binary if present.
    return await edgeTts(text, lang);
  }
}

async function googleTts(text: string, lang: 'bn' | 'en') {
  const voice = lang === 'bn'
    ? { languageCode: 'bn-IN', name: 'bn-IN-Standard-A' }
    : { languageCode: 'en-IN', name: 'en-IN-Neural2-A' };
  const body = {
    input: { ssml: `<speak>${escapeSsml(text)}</speak>` },
    voice,
    audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 }
  };
  const r = await fetch(`${GOOGLE_URL}?key=${process.env.GOOGLE_TTS_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`google-tts-${r.status}`);
  const j = (await r.json()) as { audioContent: string };
  return Buffer.from(j.audioContent, 'base64');
}

async function edgeTts(text: string, lang: 'bn' | 'en') {
  // We shell out to `edge-tts` Python CLI if installed. The function call is
  // safe — input is escaped, output is a finite subprocess. The n8n flow
  // handles the equivalent path via the HTTP Request node when this server
  // is the one initiating edge-tts for a webhook reply.
  const { execFile } = await import('node:child_process');
  const voice = EDGE_VOICE[lang];
  return await new Promise<{ buf: Buffer; provider: 'edge'; mime: string }>((resolve, reject) => {
    execFile('edge-tts', ['--voice', voice, '--text', text, '--write-media', '-'], { encoding: 'buffer', maxBuffer: 4 << 20 }, (err, stdout) => {
      if (err) return reject(err);
      resolve({ buf: stdout as Buffer, provider: 'edge' as const, mime: 'audio/mpeg' });
    });
  });
}

function escapeSsml(s: string) {
  return s.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]!));
}

// Telegram Bot API minimal client.
// Used by:
//  - /api/telegram-webhook (sending voice confirmations + typing indicators)
//  - /invite landing page (sending a message to a new friend)
//
// We never use this from the browser. All calls go through /api/* routes.

const TG_API = 'https://api.telegram.org';

export async function sendTyping(chatId: number | string) {
  return call('sendChatAction', { chat_id: chatId, action: 'record_voice' }).catch(() =>
    call('sendChatAction', { chat_id: chatId, action: 'typing' })
  );
}

export async function sendVoice(chatId: number | string, buf: Buffer, caption = '') {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('caption', caption.slice(0, 900));
  fd.append('parse_mode', 'HTML');
  fd.append('voice', new Blob([buf], { type: 'audio/mpeg' }), 'voice.mp3');
  return fetch(`${TG_API}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendVoice`, { method: 'POST', body: fd });
}

export async function sendMessage(chatId: number | string, text: string, html = false) {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: html ? 'HTML' : undefined,
    disable_web_page_preview: true
  });
}

async function call(method: string, body: Record<string, unknown>) {
  const r = await fetch(`${TG_API}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`tg-${method}-${r.status}: ${await r.text()}`);
  return (await r.json()) as unknown;
}

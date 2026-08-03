// Download a Telegram voice / audio file (URL returned from getFile) into a buffer.
export async function downloadTgFile(fileId: string) {
  const r1 = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  if (!r1.ok) throw new Error('tg-getfile-failed');
  const j = (await r1.json()) as { result: { file_path: string } };
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${j.result.file_path}`;
  const r2 = await fetch(url);
  if (!r2.ok) throw new Error('tg-file-fetch-failed');
  const ab = await r2.arrayBuffer();
  return Buffer.from(ab);
}

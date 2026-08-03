'use client';
// Telegram Login Widget as a React component. Falls back to a plain link in dev.
// We do not load the widget script ourselves — the official widget script does its
// thing on render. We derive the "data-auth-url" ourselves so we control where
// the verification happens.

type Props = {
  botUsername: string;
  invite?: string;
  className?: string;
  size?: 'small' | 'medium' | 'large';
};

export default function TelegramLoginButton({ botUsername, invite, className = '', size = 'medium' }: Props) {
  // The official Telegram widget uses an inline script element with class
  // "telegram-login". Re-using a tiny client-only render of that anchor.
  const authUrl = `/api/telegram-login/callback${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`;
  useEffect(() => {
    const id = 'telegram-widget-script';
    if (document.getElementById(id)) return;
    const s = document.createElement('script');
    s.id = id;
    s.async = true;
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    document.body.appendChild(s);
  }, []);
  return (
    <div className={className}>
      {/* @ts-expect-error — widget script will rewrite the anchor */}
      <a
        href={`https://oauth.telegram.org/auth?bot_id=${process.env.NEXT_PUBLIC_TELEGRAM_LOGIN_BOT_ID}&origin=${encodeURIComponent(
          typeof window !== 'undefined' ? window.location.origin : ''
        )}&return_to=${encodeURIComponent(authUrl)}`}
        className={`telegram-login cofre_tg_widget`}
        data-telegram-login={botUsername}
        data-size={size}
        data-auth-url={authUrl}
        data-request-access="write"
      >
        Continue with Telegram
      </a>
      <style jsx global>{`
        .cofre_tg_widget {
          display: inline-block;
          padding: 10px 18px;
          background: #229ED9;
          color: white;
          border-radius: 4px;
          font-family: var(--font-sans);
          font-size: 14px;
          letter-spacing: -0.01em;
        }
      `}</style>
    </div>
  );
}

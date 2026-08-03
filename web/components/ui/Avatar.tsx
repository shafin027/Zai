export function Avatar({ src, name, size = 32 }: { src: string | null; name: string; size?: number }) {
  const initials = name?.slice(0, 1).toUpperCase() ?? '?';
  const dim = { width: size, height: size };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...dim}
        src={src}
        alt={name}
        className="rounded-full border border-surface-line object-cover bg-surface-raised"
      />
    );
  }
  return (
    <span
      {...dim}
      style={{ lineHeight: `${size}px`, fontSize: size * 0.42 }}
      className="inline-flex items-center justify-center rounded-full bg-accent text-surface font-medium select-none"
    >
      {initials}
    </span>
  );
}

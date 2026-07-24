type IconProps = React.SVGProps<SVGSVGElement>;

export function IconTrophy({ withBase = false, ...props }: IconProps & { withBase?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M8 2h8l-1 7a4 4 0 11-6 0L8 2z" />
      <path d="M10 13h4v6h-4z" />
      {withBase && <path d="M8 21h8" stroke="currentColor" strokeWidth={2} />}
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} {...props}>
      <path d="M4 13l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPeopleHero(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <circle cx={9} cy={8} r={3.2} />
      <path d="M3 19a6 6 0 0112 0" strokeLinecap="round" />
      <circle cx={17.5} cy={9} r={2.6} />
      <path d="M15 19a5 5 0 016-4.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconPeopleAbout(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <circle cx={9} cy={8} r={3} />
      <path d="M3 19a6 6 0 0112 0" strokeLinecap="round" />
      <path d="M16 11a3 3 0 000-6" strokeLinecap="round" />
    </svg>
  );
}

export function IconMedal(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.8 7.2 17.3l.9-5.4L4.2 7.7l5.4-.8L12 2z" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M5 21V8l7-5 7 5v13" strokeLinejoin="round" />
      <path d="M8 21v-6h8v6" />
      <path d="M10 11h4" strokeLinecap="round" />
    </svg>
  );
}

export function IconTarget(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <circle cx={12} cy={12} r={9} />
      <circle cx={12} cy={12} r={4.5} />
      <circle cx={12} cy={12} r={1} fill="currentColor" />
    </svg>
  );
}

export function IconPlayBox(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x={3} y={5} width={18} height={14} rx={3} />
      <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M5 3l16 9-16 9z" />
    </svg>
  );
}

export function IconQuestion(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path
        d="M9.5 9a2.5 2.5 0 113.5 2.3c-.9.4-1.5 1.2-1.5 2.2"
        strokeLinecap="round"
      />
      <circle cx={12} cy={17.5} r={1.2} fill="currentColor" stroke="none" />
      <circle cx={12} cy={12} r={9.5} />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x={3} y={5} width={18} height={16} rx={2} />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

export function IconMonitor(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x={3} y={4} width={18} height={13} rx={2} />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} {...props}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function IconMessenger(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2C6.48 2 2 6.03 2 11c0 2.83 1.44 5.35 3.7 7.02V22l3.39-1.86c.93.26 1.92.4 2.91.4 5.52 0 10-4.03 10-9s-4.48-9.56-10-9.56zm1.03 12.1l-2.55-2.72-4.98 2.72 5.48-5.82 2.61 2.72 4.92-2.72-5.48 5.82z" />
    </svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x={3} y={5} width={18} height={14} rx={2} />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M5 4h4l2 5-3 2a12 12 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />
    </svg>
  );
}

export function IconLocation(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M12 21s-7-6.5-7-11a7 7 0 0114 0c0 4.5-7 11-7 11z" strokeLinejoin="round" />
      <circle cx={12} cy={10} r={2.5} />
    </svg>
  );
}

export function IconInstagram(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x={3} y={3} width={18} height={18} rx={5} />
      <circle cx={12} cy={12} r={4} />
      <circle cx={17.5} cy={6.5} r={1} fill="currentColor" />
    </svg>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <circle cx={12} cy={12} r={10} />
      <path d="M8 12.5l2.7 2.7L16 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPerson(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <circle cx={12} cy={8} r={4} />
      <path d="M4 20a8 8 0 0116 0" strokeLinecap="round" />
    </svg>
  );
}

export function IconGraduationCap(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M4 8l8-4 8 4-8 4-8-4z" />
      <path d="M7 11.5V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x={4} y={4} width={16} height={16} rx={3} />
      <path d="M4 10h16M10 4v16" />
    </svg>
  );
}

export function IconDocument(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3} {...props}>
      <path d="M4 19V5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
      <path d="M15 3v5h5" />
      <path d="M8 12h8M8 16h5" strokeLinecap="round" />
    </svg>
  );
}

export function IconQrCode(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x={3} y={3} width={7} height={7} rx={1} />
      <rect x={14} y={3} width={7} height={7} rx={1} />
      <rect x={3} y={14} width={7} height={7} rx={1} />
      <path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2" />
    </svg>
  );
}

export function IconBank(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x={3} y={10} width={18} height={9} rx={1} />
      <path d="M3 10l9-6 9 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 13v4M12 13v4M17 13v4" />
    </svg>
  );
}

export function IconPencil(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M4 20l4.5-1 10-10a2.1 2.1 0 00-3-3l-10 10L4 20z" strokeLinejoin="round" />
      <path d="M14 5l3 3" strokeLinecap="round" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} {...props}>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

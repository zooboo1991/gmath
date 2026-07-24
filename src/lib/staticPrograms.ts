export const yearlyPrograms = [
  {
    tag: "C АНГИЛАЛ",
    title: "1 жилийн хөтөлбөр",
    topics:
      "1 жил буюу 10 сарын хугацаанд +100 хичээлийг үзэж дотоодын болон олон улсын олимпиадад бэлдэнэ.",
    price: "2,800,000₮",
    period: "/ жил",
    href: "/courses/c",
  },
  {
    tag: "D АНГИЛАЛ",
    title: "1 жилийн хөтөлбөр",
    topics:
      "1 жил буюу 10 сарын хугацаанд +100 хичээлийг үзэж дотоодын болон олон улсын олимпиадад бэлдэнэ.",
    price: "2,800,000₮",
    period: "/ жил",
    href: "/courses/d",
  },
];

// Yearly programs (C/D) aren't rows in the `courses` table — they're fixed,
// hand-written pages. This is the one source of truth for their id/label/
// price so the client (ProgramDetail) and the server (/api/enroll, which
// must not trust a client-supplied price) never drift apart.
export const staticProgramById: Record<string, { label: string; price: string }> = {
  "program-c": { label: "1 жилийн хөтөлбөр (C ангилал)", price: "2,800,000₮" },
  "program-d": { label: "1 жилийн хөтөлбөр (D ангилал)", price: "2,800,000₮" },
};

/**
 * Structured data for search engines. Kept as a plain <script> rather than
 * next/script so it is present in the server-rendered HTML that crawlers read.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // The payload is built from our own DB values, never from user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export const SITE_URL = "https://gmath.mn";

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "Б.Ганбат багшийн математикийн сургалт",
  url: SITE_URL,
  logo: `${SITE_URL}/images/logo-header.png`,
  description:
    "4–12-р ангийн сурагчдад зориулсан олимпиадын математикийн онлайн сургалт.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Улаанбаатар",
    addressCountry: "MN",
  },
  telephone: "+976 9077 7400",
  email: "math.ganbat@gmail.com",
  sameAs: ["https://www.facebook.com/ganbat.surgalt/"],
};

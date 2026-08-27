import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TestRunner from "@/components/tests/TestRunner";
import { findTest, TESTS } from "@/lib/tests";
import { findTestResult } from "@/lib/tests/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return TESTS.map((test) => ({ slug: test.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const test = findTest((await params).slug);
  return test ? { title: test.title, description: test.summary } : {};
}

export default async function TestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const test = findTest(slug);
  if (!test) notFound();

  const user = await getSessionUser();
  // A child who already sat it sees what they got, with the option to retake.
  const previous = user ? await findTestResult(user.id, slug).catch(() => undefined) : undefined;

  return (
    <>
      <Navbar />
      <main className="bg-bg-soft">
        <TestRunner
          test={test}
          signedIn={Boolean(user)}
          previousAnswers={previous?.answers}
        />
      </main>
      <Footer />
    </>
  );
}

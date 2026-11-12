import Link from 'next/link';

/** The 404 page: one line and a way back to the title. */
export default function NotFound() {
  return (
    <main className="status-page">
      <h1 className="status-title">404 — no corridor here</h1>
      <p className="status-line">That page is not in this maze.</p>
      <Link href="/" className="status-button">
        Back to the title
      </Link>
    </main>
  );
}

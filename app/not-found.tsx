import Link from 'next/link';

/**
 * The 404 page in the design system's StatusPage pattern
 * (design/components/StatusPage): two wall tiles and the exit in a sprite
 * strip, the headline, one line and one primary button back to the title.
 */
export default function NotFound() {
  return (
    <main className="me-statuspage">
      <div className="me-statuspage-strip" aria-hidden="true">
        <img src="/images/0101.png" alt="" />
        <img src="/images/0011.png" alt="" />
        <img src="/images/exit.gif" alt="" />
      </div>
      <h1>404</h1>
      <h2>No corridor here</h2>
      <p>That page is not in this maze.</p>
      <Link href="/" className="me-btn me-btn-primary">
        Back to the title
      </Link>
    </main>
  );
}

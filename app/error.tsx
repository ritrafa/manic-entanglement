'use client';

/**
 * The crash page for any route in the design system's StatusPage pattern
 * (design/components/StatusPage): an enemy between two wall tiles in a sprite
 * strip, the headline, one line, the server-side error digest when Next passed
 * one (the details stay in the server log, not the page), and a "Try again"
 * button that calls reset() to re-render the segment.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="me-statuspage">
      <div className="me-statuspage-strip" aria-hidden="true">
        <img src="/images/0101.png" alt="" />
        <img src="/images/enemy.gif" alt="" />
        <img src="/images/0101.png" alt="" />
      </div>
      <h2>The maze tangled itself</h2>
      <p>Something went wrong while the game was running.</p>
      {error.digest && (
        <p style={{ fontSize: 14, lineHeight: '20px' }}>
          Reference: <code>{error.digest}</code>
        </p>
      )}
      <button type="button" className="me-btn me-btn-primary" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}

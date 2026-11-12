'use client';

/**
 * The crash page for any route: a short line, the server-side error digest
 * when Next passed one (the details stay in the server log, not the page),
 * and a "Try again" button that calls reset() to re-render the segment.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="status-page">
      <h1 className="status-title">The maze tangled itself</h1>
      <p className="status-line">Something went wrong while the game was running.</p>
      {error.digest && (
        <p className="status-digest">
          Reference: <code>{error.digest}</code>
        </p>
      )}
      <button type="button" className="status-button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}

import { useCallback, useEffect, useState, useRef } from "react";

const CLICK_THRESHOLD = 10; // Threshold to differentiate between click and swipe

export default function MobileSwiper({ children, onSwipe }) {
  const wrapperRef = useRef(null);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [startTime, setStartTime] = useState(0);

  const handleTouchStart = useCallback((e) => {
    if (!wrapperRef.current.contains(e.target)) {
      return;
    }

    setStartX(e.touches[0].clientX);
    setStartY(e.touches[0].clientY);
    setStartTime(Date.now());
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      if (!wrapperRef.current.contains(e.target)) {
        return;
      }

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const deltaTime = Date.now() - startTime;

      if (Math.abs(deltaX) < CLICK_THRESHOLD && Math.abs(deltaY) < CLICK_THRESHOLD && deltaTime < 500) {
        // Treat it as a click
        e.target.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      } else {
        // Treat it as a swipe
        onSwipe && onSwipe({ deltaX, deltaY });
      }
    },
    [startX, startY, startTime, onSwipe]
  );

  useEffect(() => {
    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);

  return <div ref={wrapperRef}>{children}</div>;
}

import { useCallback, useEffect, useState, useRef } from "react"

export default function MobileSwiper({ children, onSwipe }) {
    const wrapperRef = useRef(null)
    const [startX, setStartX] = useState(0)
    const [startY, setStartY] = useState(0)

    const handleTouchStart = useCallback((e) => {
        if (!wrapperRef.current.contains(e.target)) {
            return
        }

        e.preventDefault()

        setStartX(e.touches[0].clientX)
        setStartY(e.touches[0].clientY)
    }, [])

    const handleTouchEnd = useCallback(
        (e) => {
            if (!wrapperRef.current.contains(e.target)) {
                return
            }

            e.preventDefault()

            const endX = e.changedTouches[0].clientX
            const endY = e.changedTouches[0].clientY
            const deltaX = endX - startX
            const deltaY = endY - startY

            onSwipe({ deltaX, deltaY })
        }, [startX, startY, onSwipe])

    useEffect(() => {
        const options = { passive: false }
        window.addEventListener("touchstart", handleTouchStart, options)
        window.addEventListener("touchend", handleTouchEnd, options)

        return () => {
            window.removeEventListener("touchstart", handleTouchStart, options)
            window.removeEventListener("touchend", handleTouchEnd, options)
        }
    }, [handleTouchStart, handleTouchEnd])

    return <div ref={wrapperRef}>{children}</div>
}
// frontend/src/hooks/useChartZoom.ts
// Handle scroll wheel, button clicks, and drag interactions for chart zoom/pan

import { useEffect, useRef } from 'react';
import { useChartStore } from '../store/chartStore';

export function useChartZoom(containerRef: React.RefObject<HTMLDivElement>) {
  const { zoomIn, zoomOut, pan, setAutoScroll, resetViewport, viewportStartMs, viewportEndMs } = useChartStore();
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartViewportRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scroll wheel zoom
    const handleWheel = (e: WheelEvent) => {
      // Only handle scroll if cursor is over chart
      if (!container.contains(e.target as Node)) return;
      
      e.preventDefault();
      
      // deltaY > 0 = scroll down = zoom out; deltaY < 0 = scroll up = zoom in
      if (e.deltaY > 0) {
        zoomOut();
      } else {
        zoomIn();
      }
    };

    // Mouse drag to pan
    const handleMouseDown = (e: MouseEvent) => {
      // Only pan with middle mouse button or Ctrl+Left
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        isDraggingRef.current = true;
        dragStartXRef.current = e.clientX;
        dragStartViewportRef.current = viewportStartMs !== null && viewportEndMs !== null
          ? { start: viewportStartMs, end: viewportEndMs }
          : null;
        setAutoScroll(false);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragStartViewportRef.current || !container) return;
      
      const deltaX = e.clientX - dragStartXRef.current;
      const containerWidth = container.getBoundingClientRect().width;
      const viewportRange = dragStartViewportRef.current.end - dragStartViewportRef.current.start;
      
      // Map pixel movement to time movement
      const deltaMs = -(deltaX / containerWidth) * viewportRange;
      pan(deltaMs);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      dragStartViewportRef.current = null;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [containerRef, zoomIn, zoomOut, pan, setAutoScroll, viewportStartMs, viewportEndMs]);

  return {
    zoomIn,
    zoomOut,
    setAutoScroll,
    resetViewport,
  };
}

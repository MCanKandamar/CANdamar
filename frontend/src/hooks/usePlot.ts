import { useEffect, useRef } from 'react';
import uPlot from 'uplot';

const MIN_PLOT_HEIGHT = 120;

export function usePlot(
  opts: uPlot.Options,
  data: uPlot.AlignedData,
  optsDeps: React.DependencyList = [],
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef      = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    plotRef.current?.destroy();
    plotRef.current = new uPlot(opts, data, containerRef.current);
    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, optsDeps);

  // Keep the plot sized to its container (tab switch, split view, window resize).
  // The container is sized by its flex parent, so resizing the plot never
  // feeds back into the observed size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = () => {
      const plot = plotRef.current;
      // Hidden tab (display:none) reports 0 x 0 -- keep the last size
      if (!plot || el.clientWidth === 0 || el.clientHeight === 0) return;
      const legend = plot.root.querySelector<HTMLElement>('.u-legend');
      const height = el.clientHeight - (legend?.offsetHeight ?? 0);
      plot.setSize({ width: el.clientWidth, height: Math.max(MIN_PLOT_HEIGHT, height) });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, optsDeps);

  // Update data without rebuilding - cheap redraw
  useEffect(() => {
    if (plotRef.current && data[0].length > 0) {
      plotRef.current.setData(data);
    }
  }, [data]);

  return { containerRef, plotRef };
}
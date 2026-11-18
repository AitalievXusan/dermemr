import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DOC_CSS, DOC_FONTS } from './docStyles';

export interface DocFrameHandle {
  print: () => void;
}

/**
 * Изолированный iframe для документа: белый лист вне темы приложения, точные мм/pt,
 * печать (сохранение в PDF) только содержимого документа.
 */
export const DocFrame = forwardRef<DocFrameHandle, { children: ReactNode; widthPx: number; pageCss: string; title: string }>(
  function DocFrame({ children, widthPx, pageCss, title }, ref) {
    const frameRef = useRef<HTMLIFrameElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const [body, setBody] = useState<HTMLElement | null>(null);
    const [height, setHeight] = useState(600);
    const [scale, setScale] = useState(1);

    const init = useCallback(() => {
      const doc = frameRef.current?.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(
        `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title>` +
          `<link rel="stylesheet" href="${DOC_FONTS}"><style>${DOC_CSS}@page{${pageCss}}</style></head><body></body></html>`,
      );
      doc.close();
      setBody(doc.body);
    }, [pageCss, title]);

    useEffect(() => {
      init();
    }, [init]);

    useEffect(() => {
      if (!body) return;
      const ro = new ResizeObserver(() => setHeight(body.scrollHeight));
      ro.observe(body);
      return () => ro.disconnect();
    }, [body]);

    useEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const ro = new ResizeObserver(() => setScale(Math.min(1, (wrap.clientWidth - 2) / widthPx)));
      ro.observe(wrap);
      return () => ro.disconnect();
    }, [widthPx]);

    useImperativeHandle(ref, () => ({
      print: () => frameRef.current?.contentWindow?.print(),
    }));

    return (
      <div ref={wrapRef} className="docframe" style={{ height: height * scale + 2 }}>
        <iframe
          ref={frameRef}
          title={title}
          className="docframe__iframe"
          style={{ width: widthPx, height, transform: `scale(${scale})` }}
        />
        {body && createPortal(children, body)}
      </div>
    );
  },
);

import { useEffect, useRef } from 'react';
import { createEditor } from '@local/slidekit';
import '@local/slidekit/style.css';

// initialDocument is read on mount; use setDocument for explicit later loads.
export function ReactEditor({ initialDocument, onChange, locale = 'zh-CN', pdfAssetsUrl = '/slidekit-pdf/' }) {
  const container = useRef(null);
  const handle = useRef(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    const editor = createEditor(container.current, { document: initialDocument, pdfAssetsUrl, locale });
    handle.current = editor;
    const off = editor.on('change', () => callback.current?.(editor.getDocument()));
    return () => { off(); editor.destroy(); handle.current = null; };
  }, []);
  useEffect(() => { handle.current?.setLocale(locale); }, [locale]);
  return <div ref={container} style={{ height: '720px', width: '100%' }} />;
}

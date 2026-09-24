import { useEffect, useRef } from 'react';
import { createEditor } from '@local/slidekit';
import '@local/slidekit/style.css';

// initialDocument is read on mount; use setDocument for explicit later loads.
export function ReactEditor({ initialDocument, onChange, pdfAssetsUrl = '/slidekit-pdf/' }) {
  const container = useRef(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    const editor = createEditor(container.current, { document: initialDocument, pdfAssetsUrl });
    const off = editor.on('change', () => callback.current?.(editor.getDocument()));
    return () => { off(); editor.destroy(); };
  }, []);
  return <div ref={container} style={{ height: '720px', width: '100%' }} />;
}

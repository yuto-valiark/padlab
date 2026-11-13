import { useEffect } from 'react';
import { useStudio } from '../state/store';

/** One message at a time, top-right. Auto-hides after a while. */
export function Toast() {
  const notice = useStudio((s) => s.notice);
  const setNotice = useStudio((s) => s.setNotice);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), Math.max(5000, notice.length * 90));
    return () => clearTimeout(id);
  }, [notice, setNotice]);
  if (!notice) return null;
  return (
    <div className="toast" role="status">
      <span>{notice}</span>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => setNotice(null)} aria-label="閉じる">
        ×
      </button>
    </div>
  );
}

import React, { useRef } from 'react';

export type SignatureStrokes = number[][][];

export function drawSignature(canvas: HTMLCanvasElement, strokes: SignatureStrokes): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokes.forEach(stroke => {
    ctx.beginPath();
    stroke.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x * canvas.width, y * canvas.height);
      else ctx.lineTo(x * canvas.width, y * canvas.height);
    });
    ctx.stroke();
  });
}

export const SignaturePreview: React.FC<{ strokes: SignatureStrokes }> = ({ strokes }) => (
  <svg viewBox="0 0 800 240" role="img" aria-label="Handwritten electronic signature" className="h-28 w-full rounded-lg border border-slate-200 bg-white">
    {strokes.map((stroke, index) => <polyline key={index} points={stroke.map(([x, y]) => `${x * 800},${y * 240}`).join(' ')} fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
  </svg>
);

export const SignaturePad: React.FC<{ value: SignatureStrokes; onChange: (value: SignatureStrokes) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const pending = useRef<SignatureStrokes>(value);
  React.useEffect(() => { pending.current = value; if (canvas.current) drawSignature(canvas.current, value); }, [value]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  };
  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId) return;
    const completed = pending.current.filter(stroke => stroke.length >= 2);
    pointer.current = null;
    onChange(completed);
    if (canvas.current) drawSignature(canvas.current, completed);
  };
  return <div className="space-y-3">
    <p className="text-xs text-slate-600">Draw your own signature with a mouse, touchscreen, or stylus.</p>
    <canvas ref={canvas} width={800} height={240} aria-label="Draw your electronic signature" className="w-full touch-none rounded-lg border border-slate-300 bg-white" style={{ aspectRatio: '10 / 3' }}
      onPointerDown={event => {
        if (disabled || pointer.current !== null || pending.current.length >= 100) return;
        event.preventDefault(); pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        pending.current = [...pending.current, [point(event)]];
      }}
      onPointerMove={event => {
        if (disabled || pointer.current !== event.pointerId) return;
        if (pending.current.reduce((count, stroke) => count + stroke.length, 0) >= 10000) return;
        const last = pending.current[pending.current.length - 1];
        last.push(point(event)); drawSignature(event.currentTarget, pending.current);
      }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
    <button type="button" disabled={disabled} onClick={() => { pointer.current = null; onChange([]); }} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold">Clear signature</button>
    {value.length > 0 && <><p className="text-xs font-semibold">Signature preview</p><SignaturePreview strokes={value} /></>}
  </div>;
};

"use client"

import React, { useEffect, useState } from 'react';

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle + 180);
  const end = polarToCartesian(cx, cy, r, startAngle + 180);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

interface VMAFGaugeProps {
  score: number;
  model: string;
}

export default function VMAFGauge({ score, model }: VMAFGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = score;
    const duration = 1000;
    const increment = end / (duration / 16);
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setAnimatedScore(end);
        clearInterval(timer);
      } else {
        setAnimatedScore(start);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [score]);

  const size = 200;
  const stroke = 16;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const radius = (size - stroke * 2) / 2;
  
  const bgArc = arcPath(cx, cy, radius, 0, 180);
  
  // Needle rotation calculation
  const rotation = -90 + (animatedScore / 100) * 180;

  // Determine color based on score
  let scoreColor = '#ef4444'; // default red
  if (animatedScore >= 93) scoreColor = '#22c55e';
  else if (animatedScore >= 80) scoreColor = '#84cc16';
  else if (animatedScore >= 60) scoreColor = '#eab308';
  else if (animatedScore >= 40) scoreColor = '#f97316';

  return (
    <div className="relative flex flex-col items-center justify-center pt-4" style={{ width: size, height: size * 0.65 }}>
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`} className="absolute top-0">
        <defs>
          <linearGradient id="vmafGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="30%" stopColor="#f97316" />
            <stop offset="55%" stopColor="#eab308" />
            <stop offset="75%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>

        {/* Background Track */}
        <path d={bgArc} stroke="#1e293b" strokeWidth={stroke} fill="none" strokeLinecap="round" />
        
        {/* Gradient Fill Track */}
        <path d={bgArc} stroke="url(#vmafGrad)" strokeWidth={stroke - 4} fill="none" strokeLinecap="round" />
      </svg>

      {/* Needle */}
      <div 
        className="absolute bottom-0 flex flex-col items-center justify-end origin-bottom transition-transform duration-75 ease-linear"
        style={{ width: 20, height: size * 0.45, transform: `rotate(${rotation}deg)` }}
      >
        <div className="w-1 h-10 bg-white rounded shadow-md -mb-1" />
        <div className="w-4 h-4 rounded-full bg-white border-4 border-slate-900 z-10" />
      </div>

      <div className="absolute text-center" style={{ bottom: -20 }}>
        <div className="text-4xl font-black transition-colors" style={{ color: scoreColor }}>
          {Math.round(animatedScore)}
        </div>
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">VMAF</div>
        {model && (
          <div className="text-[10px] text-slate-500 mt-0.5 max-w-[150px] truncate" title={model}>
            {model}
          </div>
        )}
      </div>
    </div>
  );
}

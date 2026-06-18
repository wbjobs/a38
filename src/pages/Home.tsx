import { useState, useCallback } from 'react';
import FluidScene from '../components/FluidScene';
import ControlPanel from '../components/ControlPanel';
import HUD from '../components/HUD';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function Home() {
  const [ready, setReady] = useState<boolean | null>(null);
  const handleReady = useCallback((ok: boolean) => {
    setReady(ok);
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#0a0e1a] text-white">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 1200px 800px at 15% 10%, rgba(0,100,180,0.18), transparent 60%),
              radial-gradient(ellipse 900px 600px at 85% 90%, rgba(140,60,220,0.14), transparent 60%),
              radial-gradient(ellipse 600px 600px at 50% 50%, rgba(0,200,255,0.05), transparent 70%)
            `,
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0,229,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,229,255,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <FluidScene onReady={handleReady} />
      <HUD />
      <ControlPanel />

      {ready === false && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div
            className="max-w-md w-full rounded-2xl border p-7 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(40,20,30,0.95) 0%, rgba(30,15,25,0.95) 100%)',
              borderColor: 'rgba(255,120,140,0.3)',
              boxShadow: '0 20px 60px rgba(255,60,80,0.25)',
            }}
          >
            <div className="w-14 h-14 mx-auto mb-5 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,100,120,0.15)' }}
            >
              <AlertTriangle size={28} className="text-rose-300" />
            </div>
            <h2 className="text-[20px] font-semibold text-white mb-3 tracking-wide">
              浏览器不支持 GPU 计算
            </h2>
            <p className="text-[13px] text-white/60 leading-relaxed mb-6">
              此演示需要支持 WebGPU（优先）或 WebGL2 的现代浏览器。WebGPU 模式性能最佳，WebGL2 模式会自动降级使用。请使用最新版 Chrome / Edge / Safari 17+ 打开本页面。
            </p>
            <button
              onClick={() => location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all hover:scale-[1.03]"
              style={{
                background: 'linear-gradient(135deg, #ff6478 0%, #ff4466 100%)',
                boxShadow: '0 6px 20px rgba(255,100,120,0.35)',
              }}
            >
              <RotateCcw size={14} />
              刷新重试
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div
          className="px-4 py-1.5 rounded-full text-[10px] tracking-widest uppercase text-white/40 backdrop-blur-md"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          }}
        >
          Drag to orbit · Scroll to zoom · Click 释放粒子 to start
        </div>
      </div>
    </div>
  );
}

import { useSimStore } from '../store/useSimStore';
import { Cpu, Droplet, Layers, Timer } from 'lucide-react';

export default function HUD({ webgpuOk }: { webgpuOk: boolean }) {
  const fps = useSimStore((s) => s.fps);
  const activeParticles = useSimStore((s) => s.activeParticles);
  const obstacleType = useSimStore((s) => s.obstacleType);

  const items = [
    {
      icon: <Timer size={13} />,
      label: 'FPS',
      value: fps.toString(),
      color: fps >= 50 ? 'text-emerald-300' : fps >= 30 ? 'text-amber-300' : 'text-rose-300',
    },
    {
      icon: <Droplet size={13} />,
      label: '粒子',
      value: `${activeParticles.toLocaleString()} / 8,000`,
      color: 'text-cyan-300',
    },
    {
      icon: <Layers size={13} />,
      label: 'LBM 格子',
      value: '32³ = 32,768',
      color: 'text-purple-300',
    },
    {
      icon: <Cpu size={13} />,
      label: webgpuOk ? 'GPU' : '模式',
      value: webgpuOk
        ? obstacleType === 'sphere' ? '球绕流' : obstacleType === 'torus' ? '环绕流' : '环结绕流'
        : 'CPU Fallback',
      color: 'text-pink-300',
    },
  ];

  return (
    <div className="absolute top-5 left-5 z-10 max-w-[calc(100vw-40px)]">
      <div
        className="rounded-xl backdrop-blur-xl border p-3.5 flex flex-col gap-2.5 min-w-[220px]"
        style={{
          background: 'linear-gradient(135deg, rgba(10,14,26,0.72) 0%, rgba(14,18,36,0.62) 100%)',
          borderColor: 'rgba(120,170,255,0.12)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'rgba(120,170,255,0.08)' }}>
          <div className="relative">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: webgpuOk ? '#00e5ff' : '#ff6478',
                boxShadow: `0 0 8px ${webgpuOk ? 'rgba(0,229,255,0.8)' : 'rgba(255,100,120,0.8)'}`,
              }}
            />
          </div>
          <div
            className="text-[11px] font-semibold tracking-widest uppercase text-white/70"
            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
          >
            Sim Status
          </div>
        </div>

        {items.map((it) => (
          <div key={it.label} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-white/50 text-[11px]">
              <span className={it.color}>{it.icon}</span>
              <span>{it.label}</span>
            </div>
            <span
              className={`text-[12px] font-mono font-semibold tabular-nums ${it.color}`}
              style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
            >
              {it.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { Activity, Droplets, Box, Disc, CircleDot, RotateCw, Gauge, Sliders, Zap } from 'lucide-react';
import { useSimStore } from '../store/useSimStore';
import { ObstacleType } from '../utils/constants';
import { cn } from '../lib/utils';

export default function ControlPanel({ webgpuOk }: { webgpuOk: boolean }) {
  const {
    isEmitting, toggleEmitting,
    viscosity, setViscosity,
    emitRate, setEmitRate,
    obstacleType, setObstacleType,
    obstacleRotationSpeed, setObstacleRotationSpeed,
    flowSpeed, setFlowSpeed,
  } = useSimStore();

  const obstacles: { type: ObstacleType; label: string; icon: React.ReactNode }[] = [
    { type: 'sphere', label: '球体', icon: <CircleDot size={14} /> },
    { type: 'torus', label: '圆环', icon: <Disc size={14} /> },
    { type: 'torusKnot', label: '环结', icon: <Box size={14} /> },
  ];

  return (
    <div className="absolute top-5 right-5 w-[300px] max-w-[calc(100vw-40px)] z-10">
      <div
        className="rounded-2xl overflow-hidden backdrop-blur-xl border shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(20,28,52,0.78) 0%, rgba(14,20,40,0.68) 100%)',
          borderColor: 'rgba(120,170,255,0.18)',
          boxShadow: '0 8px 40px rgba(0,40,120,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div
          className="px-5 py-4 flex items-center gap-2.5 border-b"
          style={{ borderColor: 'rgba(120,170,255,0.12)' }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #00e5ff 0%, #7c4dff 100%)',
              boxShadow: '0 0 18px rgba(0,229,255,0.35)',
            }}
          >
            <Droplets size={18} className="text-white" />
          </div>
          <div>
            <div
              className="text-[15px] font-semibold tracking-wide text-white"
              style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
            >
              WebGPU Fluid
            </div>
            <div
              className="text-[10px] uppercase tracking-widest"
              style={{ color: webgpuOk ? 'rgba(0,229,255,0.8)' : 'rgba(255,100,120,0.8)' }}
            >
              {webgpuOk ? '● GPU 计算已就绪' : '✕ WebGPU 不可用'}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <button
            onClick={toggleEmitting}
            disabled={!webgpuOk}
            className={cn(
              'w-full py-4 rounded-xl font-semibold text-[14px] tracking-wider transition-all duration-300 relative overflow-hidden group',
              isEmitting
                ? 'text-white'
                : 'text-white',
              !webgpuOk && 'opacity-40 cursor-not-allowed'
            )}
            style={{
              background: isEmitting
                ? 'linear-gradient(135deg, #7c4dff 0%, #00e5ff 100%)'
                : 'linear-gradient(135deg, #00e5ff 0%, #7c4dff 100%)',
              boxShadow: isEmitting
                ? '0 0 30px rgba(124,77,255,0.55), inset 0 1px 0 rgba(255,255,255,0.25)'
                : '0 4px 20px rgba(0,229,255,0.45), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <Zap size={16} className={isEmitting ? 'animate-pulse' : ''} />
              {isEmitting ? '停止喷射' : '释放粒子'}
            </span>
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                transform: 'translateX(-100%)',
                animation: isEmitting ? 'shimmer 1.8s infinite' : undefined,
              }}
            />
          </button>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[12px] text-white/70">
                <Sliders size={12} /> 粘度
              </label>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-cyan-300 font-mono tabular-nums">
                {viscosity.toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min={0.001}
              max={0.05}
              step={0.001}
              value={viscosity}
              onChange={(e) => setViscosity(+e.target.value)}
              className="w-full accent-cyan-400 h-1.5"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[12px] text-white/70">
                <Gauge size={12} /> 流速强度
              </label>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-purple-300 font-mono tabular-nums">
                {flowSpeed.toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min={0.02}
              max={0.4}
              step={0.005}
              value={flowSpeed}
              onChange={(e) => setFlowSpeed(+e.target.value)}
              className="w-full accent-purple-400 h-1.5"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[12px] text-white/70">
                <Activity size={12} /> 喷射速率
              </label>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-emerald-300 font-mono tabular-nums">
                {emitRate}/s
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={1500}
              step={50}
              value={emitRate}
              onChange={(e) => setEmitRate(+e.target.value)}
              className="w-full accent-emerald-400 h-1.5"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[12px] text-white/70">
                <RotateCw size={12} /> 自转速度
              </label>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-pink-300 font-mono tabular-nums">
                {obstacleRotationSpeed}°/s
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={180}
              step={5}
              value={obstacleRotationSpeed}
              onChange={(e) => setObstacleRotationSpeed(+e.target.value)}
              className="w-full accent-pink-400 h-1.5"
            />
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-1.5 text-[12px] text-white/70">
              障碍物形状
            </label>
            <div className="grid grid-cols-3 gap-2">
              {obstacles.map((o) => (
                <button
                  key={o.type}
                  onClick={() => setObstacleType(o.type)}
                  className={cn(
                    'py-2.5 rounded-lg border text-[11px] flex flex-col items-center gap-1 transition-all duration-200',
                    obstacleType === o.type
                      ? 'text-white border-transparent'
                      : 'text-white/55 hover:text-white/80'
                  )}
                  style={{
                    background: obstacleType === o.type
                      ? 'linear-gradient(135deg, rgba(0,229,255,0.25) 0%, rgba(124,77,255,0.25) 100%)'
                      : 'rgba(255,255,255,0.03)',
                    borderColor: obstacleType === o.type ? 'rgba(0,229,255,0.45)' : 'rgba(255,255,255,0.08)',
                    boxShadow: obstacleType === o.type ? '0 0 14px rgba(0,229,255,0.18)' : 'none',
                  }}
                >
                  {o.icon}
                  <span className="font-medium tracking-wide">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="px-5 py-2.5 text-[10px] text-white/35 border-t flex items-center justify-between"
          style={{ borderColor: 'rgba(120,170,255,0.1)' }}
        >
          <span className="font-mono">LBM · D3Q7 · 32³ Grid</span>
          <span>CPU仅传参</span>
        </div>
      </div>
    </div>
  );
}

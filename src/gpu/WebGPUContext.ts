export class WebGPUContext {
  device!: GPUDevice;
  adapter!: GPUAdapter;
  queue!: GPUQueue;
  initialized = false;

  async init(): Promise<boolean> {
    if (!('gpu' in navigator)) {
      console.error('WebGPU not supported in this browser');
      return false;
    }
    try {
      this.adapter = (await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      })) as GPUAdapter;
      if (!this.adapter) return false;

      this.device = (await this.adapter.requestDevice({
        requiredFeatures: ['texture-compression-bc'] as GPUFeatureName[],
        requiredLimits: {
          maxStorageBuffersPerShaderStage: 8,
          maxComputeWorkgroupStorageSize: 32768,
          maxComputeInvocationsPerWorkgroup: 1024,
        },
      })) as GPUDevice;
      this.queue = this.device.queue;

      this.device.lost.then((info) => {
        console.error('WebGPU device lost:', info.message);
        this.initialized = false;
      });

      this.initialized = true;
      return true;
    } catch (e) {
      console.error('WebGPU init failed:', e);
      return false;
    }
  }
}

export const webgpuCtx = new WebGPUContext();

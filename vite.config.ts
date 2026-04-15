import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    /** 跳 gzip 体积统计，省内存与时间；小 ECS 上更明显 */
    reportCompressedSize: false,
    /** three 等大包写出时降低并行 I/O，减轻 1～2G 内存机器上长时间卡在 rendering chunks */
    rollupOptions: {
      maxParallelFileOps: 2,
      output: {
        manualChunks(id) {
          if (id.includes('@react-three/fiber')) {
            return 'vendor-r3f';
          }
          if (id.includes('@react-three/drei') || id.includes('three-stdlib')) {
            return 'vendor-drei';
          }
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          if (id.includes('node_modules/react') || id.includes('react-dom') || id.includes('react-router-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    proxy: {
      '/api/stream': {
        target: 'http://REDACTED_IP:4280',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  clearScreen: false,
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 42018,
    strictPort: true, // Fail if port is in use to prevent random ports
    host: true,       // Listen on all local IPS
  },
  clearScreen: false, // Tauri requires this
})

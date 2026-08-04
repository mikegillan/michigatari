import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite dep pre-bundling breaks MapLibre's embedded web worker in dev (map never fires 'load'); do not remove.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})

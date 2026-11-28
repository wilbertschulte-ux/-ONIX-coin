import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  const hostingEnvironment =
    process.env.VERCEL_TARGET_ENV ||
    process.env.VERCEL_ENV ||
    process.env.ONIX_DEPLOY_ENV ||
    ''

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined, // иногда помогает
        }
      }
    },
    define: {
      'process.env': {}, // на всякий случай
      __ONIX_HOSTING_ENV__: JSON.stringify(hostingEnvironment),
    }
  }
})

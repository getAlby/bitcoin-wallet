import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), nodePolyfills({
    //include: ['buffer'],
    // Whether to polyfill specific globals.
    globals: {
      Buffer: true, // can also be 'build', 'dev', or false
    },
    protocolImports: true,
  }),],
})

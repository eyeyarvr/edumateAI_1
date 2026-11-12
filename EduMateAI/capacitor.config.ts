import type { CapacitorConfig } from '@capacitor/cli'

// The app loads the running EduMate server (site + API on one origin), so login cookies,
// file previews and uploads work exactly like in the browser.
//
// Set CAP_SERVER_URL before `pnpm cap:sync`, e.g.
//   local Wi-Fi testing:  http://192.168.x.x:4000   (your PC's IPv4 from `ipconfig`)
//   deployed:             https://edumate.example.com
// The value is baked into the Android project at sync time — re-run cap:sync after changing it.
const serverUrl = process.env.CAP_SERVER_URL || 'http://192.168.254.184:4000'

const config: CapacitorConfig = {
  appId: 'com.edumate.app',
  appName: 'EduMate AI',
  webDir: 'dist',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
  },
}

export default config

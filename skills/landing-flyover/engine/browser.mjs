import { chromium } from 'playwright';

// GPU flags per platform: ANGLE on the real GPU, never SwiftShader
export const gpuArgs = () => ({
  darwin: ['--use-angle=metal'],
  win32: ['--use-angle=d3d11'],
  linux: ['--use-angle=vulkan', '--enable-features=Vulkan'],
}[process.platform] || []).concat(['--enable-gpu', '--ignore-gpu-blocklist']);

// Prefer installed Chrome (real GPU, codecs); fall back to Playwright's Chromium
export async function launch(args = []) {
  try { return await chromium.launch({ channel: 'chrome', args }); }
  catch { return chromium.launch({ args }); }
}

// Ambient declarations so `tsc --noEmit` resolves CSS side-effect imports
// (e.g. `import './globals.css'`) even before `next dev`/`next build`
// generates next-env.d.ts. Next handles the actual bundling at build time.
declare module '*.css';

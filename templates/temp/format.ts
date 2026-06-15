// Scratch — edit freely. `temp/` is git-ignored.
// Run: npx tsx temp/format.ts

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const res = await fetch(`${BASE}/health`);
const data: unknown = await res.json();
console.log(JSON.stringify(data, null, 2));
